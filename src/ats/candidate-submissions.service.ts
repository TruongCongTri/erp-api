import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CandidatesService } from './candidates.service';
import { JobApplicationsService } from './job-applications.service';
import { ApplicationSubmissionsService } from './application-submissions.service';
import { IngestCandidateSubmissionDto } from './dto/candidate-submission.dto';
import { CandidateCvSubmittedEvent } from './candidate-application.events';
import { S3StorageService } from './s3-storage.service';
import {
  JobPostStatus,
  PlatformSource,
  CvStorageLocation,
} from './enums/ats.enum';
import { Repository } from 'typeorm';
import { JobPost } from './entities/job-post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CacheService } from 'src/common/cache/cache.service';
import { SpontaneousSubmissionDto } from './dto/public-submission.dto';

export interface IngestionResult {
  applicationId: string;
  submissionId: string;
  candidateId: string;
  isNewApplication: boolean;
}
interface CachedJobMetadata {
  id: string;
  status: JobPostStatus;
  applicationDeadline: string;
  publicTitle: string;
}
@Injectable()
export class CandidateSubmissionsService {
  private readonly logger = new Logger(CandidateSubmissionsService.name);
  private readonly JOB_CACHE_PREFIX = 'ats:job_posts:active';
  private readonly DEDUP_CACHE_PREFIX = 'ats:submission:dedup';

  constructor(
    @InjectRepository(JobPost)
    private readonly jobPostRepo: Repository<JobPost>,
    private readonly candidatesService: CandidatesService,
    private readonly applicationsService: JobApplicationsService,
    private readonly submissionsService: ApplicationSubmissionsService,
    private readonly s3StorageService: S3StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
  ) {}

  // =========================================================================
  // 1. INGEST HỒ SƠ CÓ JOB POST ID (CHO PHÉP EXPIRED, CHẶN CLOSED)
  // =========================================================================
  async ingest(dto: IngestCandidateSubmissionDto): Promise<IngestionResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // ── Tiêu chí 2: Idempotency Debounce Lock (Ngăn chặn Submit đúp trong 15s) ──
    const dedupKey = `${this.DEDUP_CACHE_PREFIX}:${dto.jobPostId}:${normalizedEmail}`;
    const isProcessing = await this.cacheService.get<boolean>(dedupKey);

    if (isProcessing) {
      throw new ConflictException(
        'Hồ sơ của bạn cho vị trí này đã được tiếp nhận và đang được xử lý. Vui lòng không gửi lại liên tục.',
      );
    }
    await this.cacheService.set(dedupKey, true, 15); // Khóa 15 giây

    // ── Tiêu chí 4: Kiểm tra trạng thái Job qua Hot-Cache $O(1)$ (Chỉ gọi 1 lần duy nhất) ──
    // Cho phép nộp khi tin đã hết hạn (isExpired = true), chỉ chặn khi CLOSED hoặc chưa PUBLISHED
    const { isExpired } = await this.assertJobPostActive(dto.jobPostId);

    // Gắn nhãn hồ sơ nộp trễ vào internalHrNotes để HR dễ dàng lọc và đánh giá
    if (isExpired) {
      dto.internalHrNotes = dto.internalHrNotes
        ? `${dto.internalHrNotes} | [Hồ sơ nộp sau hạn chót nhận hồ sơ]`
        : '[Hồ sơ nộp sau hạn chót nhận hồ sơ]';
    }

    // ── 0. Chuẩn hóa cặp định danh cvUrl & cvFileKey ──
    let resolvedCvUrl = dto.cvUrl;
    let resolvedCvFileKey = dto.cvFileKey;

    if (resolvedCvFileKey && !resolvedCvUrl) {
      resolvedCvUrl = this.s3StorageService.getFileUrl(resolvedCvFileKey);
    } else if (resolvedCvUrl && !resolvedCvFileKey) {
      // Chỉ suy ra fileKey khi cvUrl thực sự trỏ vào bucket S3 của hệ thống (không đoán mò
      // bằng cách cắt chuỗi - CV dán link ngoài, ví dụ Google Drive/LinkedIn, không có fileKey).
      resolvedCvFileKey =
        this.s3StorageService.extractFileKeyFromUrl(resolvedCvUrl) ?? undefined;
    }

    if (!resolvedCvUrl && !resolvedCvFileKey) {
      throw new BadRequestException(
        'Hồ sơ nộp yêu cầu phải có tệp đính kèm (cvFileKey) hoặc đường dẫn CV (cvUrl).',
      );
    }

    // ── 0B. Xác thực tệp tồn tại trên S3 nội bộ trước khi đẩy vào pipeline ──
    // Chặn đứng trường hợp webhook/portal gửi cvFileKey/cvUrl giả (chưa từng upload thật),
    // vốn từng khiến hồ sơ bị đẩy vào hàng đợi sàng lọc AI rồi mới lỗi NoSuchKey ở tận khâu đọc file.
    if (resolvedCvFileKey) {
      const exists = await this.s3StorageService.fileExists(resolvedCvFileKey);
      if (!exists) {
        throw new BadRequestException(
          `Tệp CV với fileKey "${resolvedCvFileKey}" không tồn tại trong hệ thống lưu trữ. Vui lòng upload CV trước khi nộp hồ sơ.`,
        );
      }
    }

    // ── 1. Phân giải & danh tính ứng viên (B-Tree Unique Index) ──
    const candidate = await this.candidatesService.findOrCreateProfile({
      fullName: dto.fullName,
      email: normalizedEmail,
      phoneNumber: dto.phoneNumber,
      linkedInUrl: dto.linkedInUrl,
      portfolioUrl: dto.portfolioUrl,
    });

    // ── 2. Tra cứu hoặc khởi tạo tiến trình ứng tuyển duy nhất (1 Candidate x 1 Job) ──
    const { application, isNew } =
      await this.applicationsService.findOrCreateApplication(
        candidate.id,
        dto.jobPostId,
      );

    // ── 3. Lưu vết điểm chạm nộp hồ sơ bất biến (Foreign Key Index) ──
    const submission = await this.submissionsService.createSubmission(
      application.id,
      {
        platformSource: dto.platformSource,
        cvUrl: resolvedCvUrl!,
        cvFileKey: resolvedCvFileKey!,
        cvStorageLocation: dto.cvStorageLocation,
        externalApplicationId: dto.externalApplicationId,
        coverLetter: dto.coverLetter,
      },
    );

    this.logger.log(
      `[Ingest Success] Ứng viên: ${candidate.email} -> Job: ${dto.jobPostId} qua kênh ${dto.platformSource}. New: ${isNew}`,
    );

    // ── 4. Kích hoạt sự kiện nền xử lý chấm điểm AI (BullMQ) ──
    this.eventEmitter.emit(
      'ats.cv_submitted',
      new CandidateCvSubmittedEvent(
        application.id,
        submission.id,
        candidate.id,
        dto.jobPostId,
        resolvedCvUrl!,
        resolvedCvFileKey,
        dto.platformSource,
        !isNew,
      ),
    );

    // Tiêu chí 3: Trả về kết quả nộp hồ sơ tinh gọn (Lean Payload)
    return {
      applicationId: application.id,
      submissionId: submission.id,
      candidateId: candidate.id,
      isNewApplication: isNew,
    };
  }

  // =========================================================================
  // 2. INGEST HỒ SƠ ỨNG TUYỂN TỰ DO (SPONTANEOUS - KHÔNG CẦN JOB POST ID)
  // =========================================================================
  async ingestSpontaneous(
    dto: SpontaneousSubmissionDto & {
      platformSource?: PlatformSource;
      cvStorageLocation?: CvStorageLocation;
    },
  ): Promise<IngestionResult> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Debounce chống click đúp theo email
    const dedupKey = `${this.DEDUP_CACHE_PREFIX}:spontaneous:${normalizedEmail}`;
    if (await this.cacheService.get<boolean>(dedupKey)) {
      throw new ConflictException(
        'Hồ sơ của bạn đang được tiếp nhận. Vui lòng không nộp lại liên tục.',
      );
    }
    await this.cacheService.set(dedupKey, true, 15);

    // Chuẩn hóa file CV
    const { resolvedCvUrl, resolvedCvFileKey } =
      await this.resolveAndValidateCv(dto.cvUrl, dto.cvFileKey);

    // 1. Lưu hoặc cập nhật danh tính ứng viên
    const candidate = await this.candidatesService.findOrCreateProfile({
      fullName: dto.fullName,
      email: normalizedEmail,
      phoneNumber: dto.phoneNumber,
      linkedInUrl: dto.linkedInUrl,
      portfolioUrl: dto.portfolioUrl,
    });

    // 2. Khởi tạo đơn ứng tuyển mở (Open Application) đưa thẳng vào Talent Pool
    const { application, isNew } =
      await this.applicationsService.findOrCreateSpontaneousApplication(
        candidate.id,
        dto.desiredJobTitle.trim(),
        dto.coverLetter,
      );

    // 3. Tạo Submission ghi nhận kênh tiếp nhận
    const submission = await this.submissionsService.createSubmission(
      application.id,
      {
        platformSource: dto.platformSource ?? PlatformSource.COMPANY_WEBSITE,
        cvUrl: resolvedCvUrl,
        cvFileKey: resolvedCvFileKey,
        cvStorageLocation: dto.cvStorageLocation,
        coverLetter: dto.coverLetter,
      },
    );

    this.logger.log(
      `[Spontaneous Ingest] Ứng viên: ${candidate.email} ứng tuyển tự do vị trí "${dto.desiredJobTitle}". Đã lưu vào Talent Pool.`,
    );

    return {
      applicationId: application.id,
      submissionId: submission.id,
      candidateId: candidate.id,
      isNewApplication: isNew,
    };
  }

  /**
   * Thẩm định JobPost có đang PUBLISHED và còn hạn nhận hồ sơ không (Hot Cached)
   */
  private async assertJobPostActive(
    jobPostId: string,
  ): Promise<{ isExpired: boolean; publicTitle: string }> {
    const cacheKey = `${this.JOB_CACHE_PREFIX}:${jobPostId}`;
    let jobMetadata = await this.cacheService.get<CachedJobMetadata>(cacheKey);

    if (!jobMetadata) {
      // Tiêu chí 3: Chỉ select 4 cột cần thiết, loại bỏ toàn bộ text JD lớn
      const job = await this.jobPostRepo.findOne({
        where: { id: jobPostId },
        select: {
          id: true,
          status: true,
          applicationDeadline: true,
          publicTitle: true,
        },
      });

      if (!job) {
        throw new NotFoundException(
          `Tin tuyển dụng với ID "${jobPostId}" không tồn tại.`,
        );
      }

      jobMetadata = {
        id: job.id,
        status: job.status,
        applicationDeadline: job.applicationDeadline.toISOString(),
        publicTitle: job.publicTitle,
      };

      // Cache 5 phút (300 giây)
      await this.cacheService.set(cacheKey, jobMetadata, 300);
    }

    if (jobMetadata.status !== JobPostStatus.PUBLISHED) {
      throw new BadRequestException(
        `Tin tuyển dụng "${jobMetadata.publicTitle}" hiện không tiếp nhận hồ sơ mới (Trạng thái: ${jobMetadata.status}).`,
      );
    }

    const deadline = new Date(jobMetadata.applicationDeadline);
    const isExpired = deadline.getTime() < Date.now();
    return { isExpired, publicTitle: jobMetadata.publicTitle };
  }

  private async resolveAndValidateCv(
    cvUrl?: string,
    cvFileKey?: string,
  ): Promise<{ resolvedCvUrl: string; resolvedCvFileKey?: string }> {
    let resolvedUrl = cvUrl;
    let resolvedKey = cvFileKey;

    if (resolvedKey && !resolvedUrl) {
      resolvedUrl = this.s3StorageService.getFileUrl(resolvedKey);
    } else if (resolvedUrl && !resolvedKey) {
      resolvedKey =
        this.s3StorageService.extractFileKeyFromUrl(resolvedUrl) ?? undefined;
    }

    if (!resolvedUrl && !resolvedKey) {
      throw new BadRequestException(
        'Vui lòng đính kèm tệp CV hoặc cung cấp đường dẫn hồ sơ.',
      );
    }

    if (resolvedKey) {
      const exists = await this.s3StorageService.fileExists(resolvedKey);
      if (!exists) {
        throw new BadRequestException(
          `Tệp CV không tồn tại trên hệ thống lưu trữ. Vui lòng tải lại tệp.`,
        );
      }
    }

    return { resolvedCvUrl: resolvedUrl!, resolvedCvFileKey: resolvedKey };
  }
}
