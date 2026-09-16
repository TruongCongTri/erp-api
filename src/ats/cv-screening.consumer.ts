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
import { ApplicationPhase } from './enums/ats.enum';
import { JobApplication } from './entities/job-application.entity';
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

      // Cập nhật trạng thái thông báo lỗi, tránh ứng dụng bị treo ở AI_SCREENING
      await this.applicationRepo.update(applicationId, {
        status: ApplicationPhase.SCREENING_REJECTED,
        internalHrNotes: `[Lỗi sàng lọc tự động]: ${error?.message || 'Không thể xử lý tệp CV'}`,
      });

      // Dùng UnrecoverableError để BullMQ dừng ngay lập tức, không retry lặp vô hạn
      throw new UnrecoverableError(error?.message || 'Lỗi xử lý sàng lọc CV');
    }
  }

  private async downloadCvFile(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    // 1. Fallback giả lập cho môi trường Test / Development khi URL storage nội bộ chưa có DNS thực
    if (
      process.env.NODE_ENV !== 'production' &&
      (url.includes('storage.chinhnambkd.vn') ||
        url.includes('localhost') ||
        url.includes('mock') ||
        url.includes('dummy'))
    ) {
      this.logger.warn(
        `[Mock Storage] Phát hiện URL thử nghiệm nội bộ: ${url}. Tự động tạo nội dung CV giả lập để tiếp tục quy trình AI.`,
      );

      const mockCvText = `
HỌ VÀ TÊN: Trương Công Trí
VỊ TRÍ: Kỹ Sư Công Nghệ / Kỹ Sư Kết Cấu
EMAIL: congtritruong@gmail.com
SỐ ĐIỆN THOẠI: 0901234567

TÓM TẮT CHUYÊN MÔN:
- Hơn 3 năm kinh nghiệm trong thiết kế kết cấu, mô hình hóa BIM và phát triển giải pháp phần mềm quản trị kỹ thuật.
- Sử dụng thành thạo Revit, AutoCAD, BIM 360, Navisworks.
- Am hiểu quy trình tổng thầu EPC, giám sát thi công, bóc tách khối lượng BOQ và tiêu chuẩn xây dựng.
- Thành thạo TypeScript, Node.js, NestJS, cơ sở dữ liệu PostgreSQL.

KINH NGHIỆM LÀM VIỆC:
1. Kỹ sư Kết cấu & Phần mềm - Công ty Cổ phần Thiết kế Xây dựng Chính Nam (2023 - Nay):
- Triển khai mô hình BIM, phối hợp kết cấu - MEP cho các dự án nhà xưởng cao tầng tại Đồng Nai và TP.HCM.
- Xây dựng dashboard theo dõi tiến độ và tối ưu luồng dữ liệu kỹ thuật.

2. Kỹ sư dự án (2021 - 2023):
- Lập bản vẽ shop drawing, kiểm soát xung đột mô hình 3D, phối hợp đội ngũ giám sát hiện trường.

HỌC VẤN:
- Cử nhân Kỹ thuật / Công nghệ phần mềm.
      `.trim();

      return {
        buffer: Buffer.from(mockCvText, 'utf-8'),
        mimeType: 'text/plain',
      };
    }

    // 2. Tải file thực tế qua fetch với kiểm soát Timeout (15s)
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
