import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CandidatesService } from './candidates.service';
import { ApplicationSubmissionsService } from './application-submissions.service';
import { IngestCandidateSubmissionDto } from './dto/candidate-submission.dto';
import { ApplicationSubmission } from './entities/application-submission.entity';
import { CandidateCvSubmittedEvent } from './candidate-application.events';
import { S3StorageService } from './s3-storage.service';

export interface IngestionResult {
  applicationId: string;
  submissionId: string;
  candidateId: string;
  isNewApplication: boolean;
}

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly candidatesService: CandidatesService,
    private readonly applicationsService: ApplicationSubmissionsService,
    private readonly s3StorageService: S3StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Ingest hồ sơ ứng viên an toàn với Transaction
   */
  async ingest(dto: IngestCandidateSubmissionDto): Promise<IngestionResult> {
    // 0. Chuẩn hóa cặp định danh cvUrl & cvFileKey đảm bảo không bị thiếu
    let resolvedCvUrl = dto.cvUrl;
    let resolvedCvFileKey = dto.cvFileKey;

    if (resolvedCvFileKey && !resolvedCvUrl) {
      resolvedCvUrl = this.s3StorageService.getFileUrl(resolvedCvFileKey);
    } else if (resolvedCvUrl && !resolvedCvFileKey) {
      resolvedCvFileKey = resolvedCvUrl.split('/').slice(-3).join('/');
    }

    if (!resolvedCvUrl && !resolvedCvFileKey) {
      throw new BadRequestException(
        'Hồ sơ nộp yêu cầu phải có tệp đính kèm (cvFileKey) hoặc đường dẫn CV (cvUrl).',
      );
    }

    // Thực thi toàn bộ quá trình tạo/khớp trong 1 Transaction duy nhất
    const result = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        // 1. Tìm hoặc khởi tạo Hồ sơ ứng viên
        const candidate =
          await this.candidatesService.findOrCreateProfileWithManager(manager, {
            fullName: dto.fullName,
            email: dto.email,
            phoneNumber: dto.phoneNumber,
            linkedInUrl: dto.linkedInUrl,
            portfolioUrl: dto.portfolioUrl,
          });

        // 2. Tra cứu hoặc khởi tạo vòng tuyển dụng (1 Candidate x 1 Job)
        const { application, isNew } =
          await this.applicationsService.findOrCreateApplicationWithManager(
            manager,
            candidate.id,
            dto.jobPostId,
            dto.internalHrNotes,
          );

        // 3. Lưu vết điểm chạm nộp hồ sơ (Submission Touchpoint)
        const submissionRepo = manager.getRepository(ApplicationSubmission);
        const submission = submissionRepo.create({
          applicationId: application.id,
          platformSource: dto.platformSource,
          cvUrl: resolvedCvUrl!,
          cvFileKey: resolvedCvFileKey!,
          externalApplicationId: dto.externalApplicationId,
          coverLetter: dto.coverLetter,
        });

        const savedSubmission = await submissionRepo.save(submission);

        return {
          applicationId: application.id,
          submissionId: savedSubmission.id,
          candidateId: candidate.id,
          isNewApplication: isNew,
        };
      },
    );

    this.logger.log(
      `[Ingest Success] Ứng viên: ${dto.email} -> Job: ${dto.jobPostId} qua kênh ${dto.platformSource}. New: ${result.isNewApplication}`,
    );

    // 4. Kích hoạt sự kiện nền sau khi Transaction đã commit thành công 100%
    this.eventEmitter.emit(
      'ats.cv_submitted',
      new CandidateCvSubmittedEvent(
        result.applicationId,
        result.submissionId,
        result.candidateId,
        dto.jobPostId,
        resolvedCvUrl!,
        resolvedCvFileKey,
        dto.platformSource,
        !result.isNewApplication,
      ),
    );

    return result;
  }
}
