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
      resolvedCvFileKey = resolvedCvUrl.split('/').slice(-3).join('/'); // Lấy đường dẫn key tương đối
    }

    if (!resolvedCvUrl && !resolvedCvFileKey) {
      throw new BadRequestException(
        'Hồ sơ nộp yêu cầu phải có tệp đính kèm (cvFileKey) hoặc đường dẫn CV (cvUrl).',
      );
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
