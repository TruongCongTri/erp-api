import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { S3StorageService } from './s3-storage.service';
import { CandidateSubmissionsService } from './candidate-submissions.service';
import { IngestCandidateSubmissionDto } from './dto/candidate-submission.dto';

export interface CvUploadJobData {
  trackingId: string;
  dto: IngestCandidateSubmissionDto;
  fileBufferBase64: string;
  fileName: string;
  mimeType: string;
}

@Processor('cv-upload-queue')
export class CvUploadProcessor extends WorkerHost {
  private readonly logger = new Logger(CvUploadProcessor.name);

  constructor(
    private readonly s3Service: S3StorageService,
    private readonly candidateSubmissionsService: CandidateSubmissionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<CvUploadJobData>): Promise<void> {
    const { trackingId, dto, fileBufferBase64, fileName, mimeType } = job.data;
    const fileBuffer = Buffer.from(fileBufferBase64, 'base64');

    this.logger.log(
      `[Job ${job.id}] Bắt đầu xử lý upload CV ngầm cho trackingId: ${trackingId}`,
    );

    // 1. Upload S3 với callback cập nhật tiến độ
    const s3Result = await this.s3Service.uploadCvStream(
      fileBuffer,
      fileName,
      mimeType,
      (percent: number) => {
        // Cập nhật tiến độ vào BullMQ job
        void job.updateProgress(percent).catch((err: Error) => {
          this.logger.warn(
            `Không thể cập nhật tiến độ cho job ${job.id}: ${err.message}`,
          );
        });

        // Bắn sự kiện realtime về client (Gateway hoặc SSE)
        this.eventEmitter.emit('ats.upload_progress', {
          trackingId,
          progress: percent,
          status: percent === 100 ? 'PROCESSING' : 'UPLOADING',
        });
      },
    );

    // 2. Gọi CandidateSubmissionsService.ingest với URL từ S3
    const ingestionResult = await this.candidateSubmissionsService.ingest({
      ...dto,
      cvUrl: s3Result.fileUrl,
      cvFileKey: s3Result.fileKey,
    });

    // 3. Thông báo hoàn tất quá trình
    this.eventEmitter.emit('ats.upload_progress', {
      trackingId,
      progress: 100,
      status: 'COMPLETED',
      result: ingestionResult,
    });

    this.logger.log(
      `[Job ${job.id}] Đã hoàn thành lưu trữ S3 và Ingestion: ${s3Result.fileUrl}`,
    );
  }
}
