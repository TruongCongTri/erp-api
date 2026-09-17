/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ScreeningJobPayload } from './cv-screening.types';
import { JobPost } from './entities/job-post.entity';
import { CvParserService } from './cv-parser.service';
import { AtsAiService } from './ats-ai.service';
import { JobApplicationsService } from './job-applications.service';
import { ApplicationPhase, AiScreeningTier } from './enums/ats.enum';
import { JobApplication } from './entities/job-application.entity';
import { ApplicationSubmission } from './entities/application-submission.entity';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';
import { S3StorageService } from './s3-storage.service';

@Processor(ATS_CV_SCREENING_QUEUE)
export class CvScreeningConsumer extends WorkerHost {
  private readonly logger = new Logger(CvScreeningConsumer.name);

  constructor(
    private readonly s3StorageService: S3StorageService,
    private readonly cvParserService: CvParserService,
    private readonly aiService: AtsAiService,
    @InjectRepository(JobApplication)
    private readonly applicationRepo: Repository<JobApplication>,
    @InjectRepository(JobPost)
    private readonly jobPostRepo: Repository<JobPost>,
    @InjectRepository(ApplicationSubmission)
    private readonly submissionRepo: Repository<ApplicationSubmission>,
    private readonly applicationsService: JobApplicationsService,
  ) {
    super();
  }

  async process(job: Job<ScreeningJobPayload>): Promise<void> {
    const { applicationId, jobPostId, cvFileKey, cvUrl, submissionId } =
      job.data;
    this.logger.log(
      `[BullMQ Worker] Bắt đầu sàng lọc AI cho Application: ${applicationId}`,
    );

    // =========================================================================
    // 0. IDEMPOTENCY CHECK: Bỏ qua nếu đơn ứng tuyển đã được xử lý xong trước đó
    // =========================================================================
    const existingApplication = await this.applicationRepo.findOneBy({
      id: applicationId,
    });

    if (!existingApplication) {
      this.logger.warn(
        `[BullMQ Worker] Application ${applicationId} không tồn tại trong CSDL. Bỏ qua job.`,
      );
      return;
    }

    if (
      existingApplication.aiScore !== null &&
      existingApplication.aiScore !== undefined &&
      existingApplication.status !== ApplicationPhase.AI_SCREENING &&
      existingApplication.status !== ApplicationPhase.APPLIED
    ) {
      this.logger.warn(
        `[BullMQ Worker] Application ${applicationId} đã được AI sàng lọc trước đó (Score: ${existingApplication.aiScore}, Status: ${existingApplication.status}). Bỏ qua job duplicate.`,
      );
      return;
    }

    try {
      // 1. Cập nhật trạng thái hồ sơ sang AI_SCREENING
      await this.applicationRepo.update(applicationId, {
        status: ApplicationPhase.AI_SCREENING,
      });

      // 2. Xác định fileKey (Tự bóc tách từ cvUrl nếu cvFileKey bị undefined)
      let resolvedKey = cvFileKey;
      const isInternalS3Url = Boolean(
        cvUrl &&
        (cvUrl.includes('amazonaws.com') ||
          cvUrl.includes('storage-chinhnamerp')),
      );

      if (!resolvedKey && isInternalS3Url && cvUrl) {
        try {
          const urlObj = new URL(cvUrl);
          resolvedKey = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ''));
        } catch {
          // Bỏ qua nếu parse url thất bại
        }
      }

      // 3. Đọc file Buffer: Ưu tiên S3 Storage qua cvFileKey, fallback sang cvUrl
      let buffer: Buffer;
      let mimeType = 'application/pdf';

      if (cvFileKey) {
        try {
          const s3File = await this.s3StorageService.getFileBuffer(cvFileKey);
          buffer = s3File.buffer;
          mimeType = s3File.mimeType;
        } catch (s3Error: any) {
          this.logger.warn(
            `[S3 getFileBuffer Failed] Không thể đọc qua cvFileKey (${cvFileKey}): ${s3Error?.message}. Thử chuyển qua tải bằng cvUrl...`,
          );
          if (cvUrl) {
            const downloaded = await this.downloadCvFile(cvUrl);
            buffer = downloaded.buffer;
            mimeType = downloaded.mimeType;
          } else {
            throw s3Error;
          }
        }
      } else if (cvUrl) {
        // Chỉ tải qua HTTP nếu là đường link CDN bên ngoài (không phải S3 private)
        const downloaded = await this.downloadCvFile(cvUrl);
        buffer = downloaded.buffer;
        mimeType = downloaded.mimeType;
      } else {
        throw new BadRequestException(
          'Hồ sơ không có cvFileKey hoặc cvUrl hợp lệ.',
        );
      }

      // 4. Kiểm tra nếu buffer tải về là trang báo lỗi XML của S3 (AccessDenied / NoSuchKey)
      if (
        mimeType.includes('xml') ||
        buffer.slice(0, 30).toString('utf-8').trim().startsWith('<?xml') ||
        buffer.slice(0, 30).toString('utf-8').trim().startsWith('<Error')
      ) {
        throw new BadRequestException(
          `Nội dung tệp nhận được là thông báo lỗi XML từ S3 thay vì file CV: ${buffer.slice(0, 200).toString('utf-8')}`,
        );
      }

      // 5. Trích xuất text thô chuẩn hóa
      const cvText = await this.cvParserService.extractText(buffer, mimeType);

      // 6. Lấy tiêu chuẩn của JobPost mục tiêu
      const jobPost = await this.jobPostRepo.findOneBy({ id: jobPostId });
      if (!jobPost) {
        throw new NotFoundException(
          `Tin tuyển dụng ${jobPostId} không tồn tại để đối chiếu CV.`,
        );
      }

      // 7. Gọi Gemini Flash Engine tính điểm & phân tích
      const scoreResult = await this.aiService.scoreCvAgainstJob(
        cvText,
        jobPost,
      );
      this.logger.log(
        `[AI Result] Application ${applicationId} - Điểm: ${scoreResult.aiScore} - Tier: ${scoreResult.aiTier}`,
      );

      // 8. Áp dụng phân luồng tự động 3-Tier
      await this.applicationsService.applyScreeningOutcome(
        applicationId,
        scoreResult,
        submissionId,
      );
    } catch (error: any) {
      this.logger.error(
        `[Screening Error] Xử lý hồ sơ ${applicationId} thất bại: ${error.message}`,
      );

      // Lỗi kỹ thuật (S3/AI/parsing) khác với việc AI thực sự chấm điểm thấp -> dùng trạng thái
      // riêng SCREENING_FAILED để HR biết đây là lỗi cần bấm chấm điểm lại thủ công,
      // KHÔNG PHẢI ứng viên đã bị AI từ chối.
      //
      // aiScore = null + aiTier = N/A: tuyệt đối KHÔNG lưu điểm mặc định (0 hay bất kỳ số nào)
      // cho hồ sơ chưa từng được chấm, tránh việc HR/dashboard hiểu sai là "ứng viên 0 điểm".
      await this.applicationRepo.update(applicationId, {
        status: ApplicationPhase.SCREENING_FAILED,
        aiScore: null,
        aiTier: AiScreeningTier.NOT_AVAILABLE,
        aiReasoning: `**Không thể chấm điểm tự động (N/A).** Lý do: ${error?.message || 'Không thể xử lý tệp CV'}. Vui lòng khắc phục nguyên nhân rồi bấm "Chấm điểm lại".`,
        internalHrNotes: `[Lỗi sàng lọc tự động]: ${error?.message || 'Không thể xử lý tệp CV'}`,
      });

      if (submissionId) {
        await this.submissionRepo.update(submissionId, {
          aiScore: null,
          aiTier: AiScreeningTier.NOT_AVAILABLE,
        });
      }

      // Dùng UnrecoverableError để BullMQ dừng ngay lập tức, không retry lặp vô hạn.
      // HR có thể bấm "Chấm điểm lại" thủ công qua POST /ats/applications/:id/rescreen
      throw new UnrecoverableError(error?.message || 'Lỗi xử lý sàng lọc CV');
    }
  }

  private async downloadCvFile(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    // Tải file thực tế qua fetch với kiểm soát Timeout (15s).
    // LƯU Ý: Trước đây có nhánh "Mock Storage" tự sinh nội dung CV giả khi gặp URL nội bộ/test
    // (storage.chinhnambkd.vn, localhost, mock, dummy) - đã loại bỏ vì nó âm thầm che giấu lỗi
    // đọc CV thật sự (S3 NoSuchKey, mất mạng...) khiến AI chấm điểm trên dữ liệu giả mà không ai biết.
    // Giờ mọi lỗi tải CV đều throw ra ngoài -> hồ sơ chuyển sang SCREENING_FAILED để HR bấm
    // "Chấm điểm lại" thủ công sau khi đã khắc phục nguyên nhân gốc.
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new BadRequestException(
          `Tải CV thất bại với HTTP status ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const contentType =
        response.headers.get('content-type') || 'application/pdf';
      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      if (
        contentType.includes('xml') ||
        fileBuffer.slice(0, 30).toString('utf-8').trim().startsWith('<?xml') ||
        fileBuffer.slice(0, 30).toString('utf-8').trim().startsWith('<Error')
      ) {
        throw new BadRequestException(
          `URL trả về thông báo lỗi XML từ S3 thay vì file CV: ${fileBuffer.slice(0, 200).toString('utf-8')}`,
        );
      }

      return {
        buffer: fileBuffer,
        mimeType: contentType,
      };
    } catch (error: any) {
      this.logger.error(`Lỗi kết nối tải CV từ ${url}: ${error?.message}`);
      throw error;
    }
  }
}
