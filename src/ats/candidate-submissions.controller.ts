import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { CandidateSubmissionsService } from './candidate-submissions.service';
import {
  PortalCandidateSubmissionDto,
  ManualCandidateSubmissionDto,
  IngestCandidateSubmissionDto,
} from './dto/candidate-submission.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { AuditActionType } from 'src/audit-log/audit-log.types';
import { PlatformSource, CvStorageLocation } from './enums/ats.enum';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, randomUUID } from 'bullmq';
import { CvUploadJobData } from './cv-upload.processor';
import {
  cvMulterOptions,
  MAX_CV_FILE_SIZE_MB,
} from 'src/config/multer-cv.config';
import { S3StorageService } from './s3-storage.service';
import {
  PublicJobSubmissionDto,
  SpontaneousSubmissionDto,
} from './dto/public-submission.dto';

@Controller('ats/submissions')
export class CandidateSubmissionsController {
  private readonly logger = new Logger(CandidateSubmissionsController.name);

  constructor(
    private readonly submissionsService: CandidateSubmissionsService,
    private readonly s3StorageService: S3StorageService,
    @InjectQueue('cv-upload-queue')
    private readonly cvUploadQueue: Queue<CvUploadJobData>,
  ) {}

  // =========================================================================
  // 1. PUBLIC CAREER WEBSITE - NỘP VÀO JOB CỤ THỂ (KỂ CẢ HẾT HẠN, CHẶN CLOSED)
  // KHÔNG CẦN ĐĂNG NHẬP - HỖ TRỢ UPLOAD FILE TRỰC TIẾP
  // =========================================================================
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Giới hạn 5 lần/phút/IP chống spam bot
  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('cvFile', cvMulterOptions))
  async submitFromCompanyWebsite(
    @Body() dto: PublicJobSubmissionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let cvStorageLocation: CvStorageLocation | undefined;

    // 1. Upload stream trực tiếp lên S3 nếu ứng viên đính kèm file
    if (file) {
      const s3Result = await this.s3StorageService.uploadCvStream(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      dto.cvFileKey = s3Result.fileKey;
      dto.cvUrl = s3Result.fileUrl;
      cvStorageLocation = s3Result.storageLocation;
    } else if (dto.cvFileKey && (!dto.cvUrl || dto.cvUrl.trim() === '')) {
      dto.cvUrl = this.s3StorageService.getFileUrl(dto.cvFileKey);
    } else if (!dto.cvUrl) {
      throw new BadRequestException(
        'Vui lòng đính kèm tệp CV (cvFile) hoặc cung cấp cvUrl.',
      );
    }

    const result = await this.submissionsService.ingest({
      ...dto,
      platformSource: PlatformSource.COMPANY_WEBSITE,
      cvStorageLocation,
    });

    return {
      success: true,
      data: result,
      message: 'Hồ sơ ứng tuyển của bạn đã được gửi thành công!',
    };
  }

  // =========================================================================
  // 2. PUBLIC TALENT POOL - ỨNG TUYỂN TỰ DO (VỊ TRÍ KHÔNG CÓ TRONG DANH SÁCH)
  // KHÔNG CẦN ĐĂNG NHẬP - LƯU VÀO TALENT POOL KÈM VỊ TRÍ MONG MUỐN
  // =========================================================================
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('spontaneous')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('cvFile', cvMulterOptions))
  async submitSpontaneous(
    @Body() dto: SpontaneousSubmissionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let cvStorageLocation: CvStorageLocation | undefined;

    if (file) {
      const s3Result = await this.s3StorageService.uploadCvStream(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      dto.cvFileKey = s3Result.fileKey;
      dto.cvUrl = s3Result.fileUrl;
      cvStorageLocation = s3Result.storageLocation;
    } else if (dto.cvFileKey && (!dto.cvUrl || dto.cvUrl.trim() === '')) {
      dto.cvUrl = this.s3StorageService.getFileUrl(dto.cvFileKey);
    } else if (!dto.cvUrl) {
      throw new BadRequestException(
        'Vui lòng đính kèm tệp CV (cvFile) hoặc cung cấp cvUrl.',
      );
    }

    const result = await this.submissionsService.ingestSpontaneous({
      ...dto,
      platformSource: PlatformSource.COMPANY_WEBSITE,
      cvStorageLocation,
    });

    return {
      success: true,
      data: result,
      message:
        'Hồ sơ của bạn đã được thêm vào Cơ sở Dữ liệu Tài năng (Talent Pool) của công ty. Chúng tôi sẽ liên hệ khi có vị trí phù hợp!',
    };
  }

  // ==========================================
  // 1. PUBLIC CAREER PORTAL INGESTION
  // ==========================================
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Chống spam nộp CV
  @Post('portal')
  async submitFromPortal(@Body() dto: PortalCandidateSubmissionDto) {
    // 1. Tự lấy URL nếu có fileKey
    let finalCvUrl = dto.cvUrl;
    if (dto.cvFileKey && !finalCvUrl) {
      finalCvUrl = this.s3StorageService.getFileUrl(dto.cvFileKey);
    }

    // 2. Tự lấy fileKey từ URL nếu thiếu
    const finalFileKey =
      dto.cvFileKey ||
      (finalCvUrl
        ? (this.s3StorageService.extractFileKeyFromUrl(finalCvUrl) ?? undefined)
        : undefined);

    if (!finalCvUrl && !finalFileKey) {
      throw new BadRequestException('Vui lòng cung cấp cvFileKey hoặc cvUrl.');
    }

    const result = await this.submissionsService.ingest({
      ...dto,
      cvUrl: finalCvUrl,
      cvFileKey: finalFileKey,
      platformSource: PlatformSource.COMPANY_WEBSITE,
    });

    return {
      success: true,
      data: result,
      message: 'Hồ sơ ứng tuyển của bạn đã được tiếp nhận thành công.',
    };
  }

  // ==========================================
  // 2. AUTOMATED WEBHOOKS (TOPCV, LINKEDIN, VNW)
  // ==========================================
  @Post('webhook/:platform')
  async handlePlatformWebhook(
    @Param('platform') platformParam: string,
    @Body() payload: IngestCandidateSubmissionDto,
  ) {
    const platform = platformParam.toUpperCase() as PlatformSource;
    if (!Object.values(PlatformSource).includes(platform)) {
      throw new BadRequestException(
        `Nền tảng webhook "${platformParam}" không được hỗ trợ.`,
      );
    }

    if (payload.cvFileKey && !payload.cvUrl) {
      payload.cvUrl = this.s3StorageService.getFileUrl(payload.cvFileKey);
    }

    const result = await this.submissionsService.ingest({
      ...payload,
      platformSource: platform,
    });

    return {
      success: true,
      data: result,
      message: `Webhook ingest từ ${platform} thành công.`,
    };
  }

  // =========================================================================
  // 3. HR MANUAL ENTRY (DÀNH CHO NỘI BỘ HR - YÊU CẦU ĐĂNG NHẬP & PHÂN QUYỀN)
  // =========================================================================
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @UseInterceptors(FileInterceptor('cvFile', cvMulterOptions), AuditInterceptor)
  @RequireAnyPermissions(
    'ats_candidate:create:any',
    'ats_candidate:manage:any',
    'ats:candidates:create',
    'ats:candidates:manage',
  )
  @Post('manual')
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Nhập hồ sơ ứng viên thủ công',
    resourceSlug: 'ats_candidate',
    resourceLabel: 'Hồ sơ ứng viên',
  })
  async submitManual(
    @Body() dto: ManualCandidateSubmissionDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.logger.log(
      `[Start Manual Submition] Ứng viên: ${dto.email} -> Job: ${dto.jobPostId} qua kênh ${dto.platformSource}`,
    );

    // 1. Đính kèm trực tiếp file qua Postman / Form-data -> Upload lên AWS S3
    let cvStorageLocation: CvStorageLocation | undefined;
    if (file) {
      const s3Result = await this.s3StorageService.uploadCvStream(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      dto.cvFileKey = s3Result.fileKey;
      dto.cvUrl = s3Result.fileUrl;
      cvStorageLocation = s3Result.storageLocation;
    }
    // 2. Nếu client truyền cvFileKey sẵn có mà không gửi file đính kèm
    else if (dto.cvFileKey && (!dto.cvUrl || dto.cvUrl.trim() === '')) {
      dto.cvUrl = this.s3StorageService.getFileUrl(dto.cvFileKey);
    }
    // 3. Nếu không có file và cũng không có thông tin file hợp lệ
    else if (!dto.cvUrl) {
      throw new BadRequestException(
        'Vui lòng đính kèm tệp CV (cvFile) hoặc cung cấp mã khóa tệp (cvFileKey).',
      );
    }

    const result = await this.submissionsService.ingest({
      ...dto,
      cvStorageLocation,
    });

    return {
      success: true,
      data: result,
      message: 'Nhập hồ sơ ứng viên thành công.',
    };
  }

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('cvFile', cvMulterOptions))
  async uploadAndIngest(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: IngestCandidateSubmissionDto,
  ): Promise<{ trackingId: string; message: string }> {
    if (!file) {
      throw new BadRequestException('Vui lòng đính kèm tệp CV ứng tuyển.');
    }

    // Tiêu chí 3: Tải trực tiếp lên S3 qua stream, loại bỏ việc đưa file Base64 10MB vào Redis
    const s3Result = await this.s3StorageService.uploadCvStream(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const trackingId = randomUUID();

    // Tiêu chí 3: Chỉ đưa metadata siêu nhẹ (< 1KB) vào hàng đợi BullMQ
    await this.cvUploadQueue.add(
      'process-cv',
      {
        trackingId,
        dto: {
          ...dto,
          cvFileKey: s3Result.fileKey,
          cvUrl: s3Result.fileUrl,
          cvStorageLocation: s3Result.storageLocation,
        },
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    return {
      trackingId,
      message: `Tệp hồ sơ đang được tải lên ngầm (tối đa ${MAX_CV_FILE_SIZE_MB}MB). Vui lòng theo dõi tiến độ qua trackingId.`,
    };
  }
}
