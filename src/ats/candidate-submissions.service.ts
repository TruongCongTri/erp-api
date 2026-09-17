import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CandidatesService } from './candidates.service';
import { JobApplicationsService } from './job-applications.service';
import { ApplicationSubmissionsService } from './application-submissions.service';
import { IngestCandidateSubmissionDto } from './dto/candidate-submission.dto';
import { CandidateCvSubmittedEvent } from './candidate-application.events';
import { S3StorageService } from './s3-storage.service';

export interface IngestionResult {
  applicationId: string;
  submissionId: string;
  candidateId: string;
  isNewApplication: boolean;
}

@Injectable()
export class CandidateSubmissionsService {
  private readonly logger = new Logger(CandidateSubmissionsService.name);

  constructor(
    private readonly candidatesService: CandidatesService,
    private readonly applicationsService: JobApplicationsService,
    private readonly submissionsService: ApplicationSubmissionsService,
    private readonly s3StorageService: S3StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async ingest(dto: IngestCandidateSubmissionDto): Promise<IngestionResult> {
    // 0. Chuẩn hóa cặp định danh cvUrl & cvFileKey đảm bảo không bao giờ undefined
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

    // 0B. Nếu có fileKey trỏ vào S3 nội bộ, xác thực tệp thực sự tồn tại trước khi ingest.
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

    // 1. Phân giải & khử trùng danh tính ứng viên
    const candidate = await this.candidatesService.findOrCreateProfile({
      fullName: dto.fullName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      linkedInUrl: dto.linkedInUrl,
      portfolioUrl: dto.portfolioUrl,
    });

    // 2. Tra cứu hoặc khởi tạo tiến trình ứng tuyển duy nhất (1 Candidate x 1 Job)
    const { application, isNew } =
      await this.applicationsService.findOrCreateApplication(
        candidate.id,
        dto.jobPostId,
      );

    // 3. Lưu vết điểm chạm nộp hồ sơ bất biến (Platform Touchpoint)
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

    // 4. Kích hoạt sự kiện nền xử lý chấm điểm AI (Layer 4)
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

    return {
      applicationId: application.id,
      submissionId: submission.id,
      candidateId: candidate.id,
      isNewApplication: isNew,
    };
  }
}
