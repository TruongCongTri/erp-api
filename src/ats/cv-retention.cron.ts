import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { ApplicationSubmission } from './entities/application-submission.entity';
import { S3StorageService } from './s3-storage.service';
import { CvStorageLocation } from './enums/ats.enum';

@Injectable()
export class CvRetentionCronService {
  private readonly logger = new Logger(CvRetentionCronService.name);

  constructor(
    @InjectRepository(ApplicationSubmission)
    private readonly submissionRepo: Repository<ApplicationSubmission>,
    private readonly s3StorageService: S3StorageService,
  ) {}

  // Chạy mỗi đêm lúc 3:00 AM, sau khi CleanupTasksService dọn recycle bin lúc 2:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCvRetentionPurge(): Promise<void> {
    const dueSubmissions = await this.submissionRepo.find({
      where: {
        isCvPurged: false,
        cvPurgeAt: LessThanOrEqual(new Date()),
      },
    });

    if (dueSubmissions.length === 0) {
      return;
    }

    this.logger.log(
      `[CV Retention] Tìm thấy ${dueSubmissions.length} CV đã hết hạn bảo lưu 7 ngày. Bắt đầu tự động xóa khỏi S3...`,
    );

    for (const submission of dueSubmissions) {
      try {
        if (submission.cvFileKey) {
          await this.s3StorageService.deleteFile(submission.cvFileKey);
        }

        submission.cvFileKey = null;
        submission.cvUrl = '';
        submission.isCvPurged = true;
        submission.cvPurgeAt = null;

        await this.submissionRepo.save(submission);

        this.logger.log(
          `[CV Retention] Đã xóa CV của submission ${submission.id} khỏi S3 (dữ liệu điểm AI vẫn được giữ lại để tham khảo).`,
        );
      } catch (error) {
        this.logger.error(
          `[CV Retention Failed] Không thể xóa CV của submission ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // Fail-safe: nếu upload S3 lúc nộp CV thất bại, tệp đã được lưu tạm cục bộ
  // (xem S3StorageService.uploadCvStream). Cron này thử upload lại mỗi 15 phút cho đến khi thành công.
  @Cron('*/15 * * * *')
  async handlePendingLocalUploadsRetry(): Promise<void> {
    const pending = await this.submissionRepo.find({
      where: {
        cvStorageLocation: CvStorageLocation.LOCAL_PENDING,
        isCvPurged: false,
      },
    });

    if (pending.length === 0) {
      return;
    }

    this.logger.log(
      `[CV Upload Retry] Tìm thấy ${pending.length} CV đang chờ upload lại lên S3...`,
    );

    for (const submission of pending) {
      if (!submission.cvFileKey) continue;

      const success = await this.s3StorageService.retryPendingUpload(
        submission.cvFileKey,
      );

      if (success) {
        submission.cvStorageLocation = CvStorageLocation.S3;
        await this.submissionRepo.save(submission);
        this.logger.log(
          `[CV Upload Retry] Submission ${submission.id} đã upload thành công lên S3.`,
        );
      }
    }
  }
}
