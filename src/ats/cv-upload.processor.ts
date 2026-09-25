import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { S3StorageService } from './s3-storage.service';
import { CandidateSubmissionsService } from './candidate-submissions.service';
import { IngestCandidateSubmissionDto } from './dto/candidate-submission.dto';
import { CvStorageLocation } from './enums/ats.enum';

export interface CvUploadJobData {
  trackingId: string;
  dto: IngestCandidateSubmissionDto;
  fileBufferBase64?: string;
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

    this.logger.log(
      `[Job ${job.id}] Bắt đầu xử lý nộp CV ngầm cho trackingId: ${trackingId}`,
    );

    let finalCvUrl = dto.cvUrl;
    let finalCvFileKey = dto.cvFileKey;
    let finalStorageLocation = dto.cvStorageLocation ?? CvStorageLocation.S3;

    // =========================================================================
    // TRƯỜNG HỢP 1: File đã được Controller upload thẳng lên S3 (Kiến trúc chuẩn)
    // Payload trong Redis chỉ là metadata siêu nhẹ (< 1KB), bỏ qua bước decode Base64
    // =========================================================================
    if (finalCvFileKey || finalCvUrl) {
      this.logger.log(
        `[Job ${job.id}] File đã tồn tại trên S3 (${finalCvFileKey || finalCvUrl}). Tiến hành Ingest trực tiếp...`,
      );

      await this.emitProgress(job, trackingId, 50, 'PROCESSING');
    }
    // =========================================================================
    // TRƯỜNG HỢP 2: Fallback nếu Job truyền file qua chuỗi Base64
    // =========================================================================
    else if (fileBufferBase64) {
      this.logger.log(
        `[Job ${job.id}] Đang giải mã Buffer Base64 và tải tệp lên AWS S3...`,
      );

      const fileBuffer = Buffer.from(fileBufferBase64, 'base64');

      const s3Result = await this.s3Service.uploadCvStream(
        fileBuffer,
        fileName,
        mimeType,
        (percent: number) => {
          void this.emitProgress(
            job,
            trackingId,
            Math.round(percent * 0.8), // 0% - 80% dành cho upload
            percent === 100 ? 'PROCESSING' : 'UPLOADING',
          );
        },
      );

      finalCvUrl = s3Result.fileUrl;
      finalCvFileKey = s3Result.fileKey;
      finalStorageLocation = s3Result.storageLocation;
    } else {
      throw new BadRequestException(
        `Job ${job.id} không hợp lệ: Không tìm thấy tệp đính kèm (thiếu cả fileKey lẫn fileBufferBase64).`,
      );
    }

    // =========================================================================
    // THỰC HIỆN INGESTION & BẮN EVENT SÀNG LỌC AI
    // =========================================================================
    const ingestionResult = await this.candidateSubmissionsService.ingest({
      ...dto,
      cvUrl: finalCvUrl,
      cvFileKey: finalCvFileKey,
      cvStorageLocation: finalStorageLocation,
    });

    // Thông báo hoàn tất 100% qua SSE/WebSocket Gateway
    await this.emitProgress(job, trackingId, 100, 'COMPLETED', ingestionResult);

    this.logger.log(
      `[Job ${job.id}] Hoàn tất xử lý lưu trữ và tiếp nhận hồ sơ thành công. ApplicationId: ${ingestionResult.applicationId}`,
    );
  }

  private async emitProgress(
    job: Job<CvUploadJobData>,
    trackingId: string,
    progress: number,
    status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED',
    result?: unknown,
  ): Promise<void> {
    try {
      await job.updateProgress(progress);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Không thể cập nhật tiến độ BullMQ job ${job.id}: ${msg}`,
      );
    }

    this.eventEmitter.emit('ats.upload_progress', {
      trackingId,
      progress,
      status,
      ...(result ? { result } : {}),
    });
  }
}
