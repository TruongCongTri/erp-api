import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { JobApplication } from './entities/job-application.entity';
import { JobPost } from './entities/job-post.entity';
import {
  UpdateApplicationPhaseDto,
  QueryJobApplicationsDto,
} from './dto/candidate-submission.dto';
import { ApplicationPhaseChangedEvent } from './candidate-application.events';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import {
  AiScreeningTier,
  ApplicationPhase,
  JobPostStatus,
} from './enums/ats.enum';
import { CandidateShortlistedEvent } from './cv-screening.events';
import { ApplicationSubmission } from './entities/application-submission.entity';
import {
  hasPermission,
  getUserDepartmentId,
  ExtendedUser,
} from '../common/utils/ats-rbac.util';
import { S3StorageService } from './s3-storage.service';
import {
  CandidateScreeningRejectedEvent,
  CandidatePooledEvent,
} from './ats-domain.events';
import { CV_RETENTION_DAYS, ATS_CV_SCREENING_QUEUE } from './ats.constants';
import { ScreeningJobPayload } from './cv-screening.types';
import { CacheService } from 'src/common/cache/cache.service';
import {
  ApplicationPromotedEvent,
  ApplicationScreeningCompletedEvent,
} from './job-applications.events';

export interface CvScoreResult {
  /** null = AI không chấm được (tier N/A). Không bao giờ lưu 0 làm giá trị mặc định. */
  aiScore: number | null;
  aiTier: AiScreeningTier;
  aiReasoning: string;
}

@Injectable()
export class JobApplicationsService {
  private readonly logger = new Logger(JobApplicationsService.name);
  private readonly PIPELINE_STATS_CACHE = 'ats:pipeline:stats';

  constructor(
    @InjectRepository(JobApplication)
    private readonly applicationRepo: Repository<JobApplication>,
    @InjectRepository(JobPost)
    private readonly jobPostRepo: Repository<JobPost>,
    @InjectRepository(ApplicationSubmission)
    private readonly submissionRepo: Repository<ApplicationSubmission>,
    @InjectQueue(ATS_CV_SCREENING_QUEUE)
    private readonly screeningQueue: Queue<ScreeningJobPayload>,
    private readonly eventEmitter: EventEmitter2,
    private readonly s3StorageService: S3StorageService,
    private readonly cacheService: CacheService,
  ) {}

  // ========================================================
  // 1. TÌM HOẶC TẠO APPLICATION (ĐỒNG BỘ UNIQUE B-TREE INDEX)
  // ========================================================
  async findOrCreateApplication(
    candidateId: string,
    jobPostId: string,
  ): Promise<{ application: JobApplication; isNew: boolean }> {
    // Tiêu chí 3: Chỉ select cột cần thiết để kiểm tra hạn nộp
    const jobPost = await this.jobPostRepo.findOne({
      where: { id: jobPostId },
      select: {
        id: true,
        status: true,
        applicationDeadline: true,
        publicTitle: true,
      },
    });
    if (!jobPost) {
      throw new NotFoundException(`Tin tuyển dụng ${jobPostId} không tồn tại.`);
    }

    // Chỉ tin ở trạng thái nháp (DRAFT) mới chặn nộp hồ sơ. Mọi trạng thái khác
    // (PENDING_HEAD_APPROVAL, PUBLISHED, CLOSED, ARCHIVED) đều tiếp nhận hồ sơ,
    // phục vụ HR nhập liệu thủ công / webhook về sau khi tin đã đóng.
    if (jobPost.status === JobPostStatus.DRAFT) {
      throw new BadRequestException(
        'Tin tuyển dụng đang ở trạng thái nháp (DRAFT) nên chưa thể tiếp nhận hồ sơ.',
      );
    }

    // Tra cứu qua Composite Index (candidateId, jobPostId)
    let application = await this.applicationRepo.findOne({
      where: { candidateId, jobPostId },
      select: {
        id: true,
        candidateId: true,
        jobPostId: true,
        status: true,
        createdAt: true,
      },
    });

    if (application) {
      return { application, isNew: false };
    }

    application = this.applicationRepo.create({
      candidateId,
      jobPostId,
      status: ApplicationPhase.APPLIED,
    });

    const saved = await this.applicationRepo.save(application);
    await this.invalidatePipelineCache(jobPostId);
    return { application: saved, isNew: true };
  }

  // ========================================================
  // 2. ỨNG TUYỂN TỰ DO (TALENT POOL SPONTANEOUS APPLICATION)
  // ========================================================
  async findOrCreateSpontaneousApplication(
    candidateId: string,
    desiredJobTitle: string,
    coverLetter?: string,
  ): Promise<{ application: JobApplication; isNew: boolean }> {
    // Tận dụng Partial Index (job_post_id IS NULL)
    let application = await this.applicationRepo.findOne({
      where: {
        candidateId,
        jobPostId: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (application) {
      application.desiredJobTitle = desiredJobTitle;
      if (coverLetter) {
        application.internalHrNotes = `[Ứng tuyển tự do cập nhật]: ${coverLetter}`;
      }
      const saved = await this.applicationRepo.save(application);
      return { application: saved, isNew: false };
    }

    application = this.applicationRepo.create({
      candidateId,
      jobPostId: null,
      desiredJobTitle,
      status: ApplicationPhase.SAVED_POOL,
      internalHrNotes: `[Ứng tuyển tự do]: Vị trí mong muốn "${desiredJobTitle}". Đã đưa vào Talent Pool.`,
    });

    const saved = await this.applicationRepo.save(application);
    return { application: saved, isNew: true };
  }

  // ========================================================
  // 4. THỐNG KÊ NHANH PIPELINE THEO CÁC GIAI ĐOẠN (CACHE $O(1)$)
  // ========================================================
  async getPipelineStats(jobPostId: string): Promise<Record<string, number>> {
    const cacheKey = `${this.PIPELINE_STATS_CACHE}:${jobPostId}`;
    const cachedStats =
      await this.cacheService.get<Record<string, number>>(cacheKey);
    if (cachedStats) return cachedStats;

    // Truy vấn tổng hợp theo nhóm Index B-Tree
    const statsRaw: Array<{ status: string; count: string }> =
      await this.applicationRepo
        .createQueryBuilder('app')
        .select('app.status', 'status')
        .addSelect('COUNT(app.id)', 'count')
        .where('app.jobPostId = :jobPostId', { jobPostId })
        .groupBy('app.status')
        .getRawMany();

    const stats: Record<string, number> = {};
    Object.values(ApplicationPhase).forEach((p) => (stats[p] = 0));
    statsRaw.forEach((row) => {
      stats[row.status] = parseInt(row.count, 10);
    });

    // Cache trong 2 phút
    await this.cacheService.set(cacheKey, stats, 120);
    return stats;
  }

  // ========================================================
  // 5. CẬP NHẬT GIAI ĐOẠN TUYỂN DỤNG (PHASE TRANSITION)
  // ========================================================
  async updatePhase(
    id: string,
    user: ActiveUserData,
    dto: UpdateApplicationPhaseDto,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id },
      relations: {
        candidate: true,
        jobPost: {
          recruitmentRequest: {
            department: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(`Không tìm thấy hồ sơ ứng tuyển ID: ${id}`);
    }
    // Kiểm tra quyền chuyển vòng tuyển dụng
    await this.assertManagePermission(application, user);

    this.assertValidPhaseTransition(application.status, dto.phase);

    const oldPhase = application.status;
    application.status = dto.phase;
    if (dto.internalHrNotes) {
      application.internalHrNotes = application.internalHrNotes
        ? `${application.internalHrNotes}\n[${new Date().toISOString()}]: ${dto.internalHrNotes}`
        : dto.internalHrNotes;
    }
    application.updatedBy = user.id || user.sub;

    const saved = await this.applicationRepo.save(application);

    // Nếu HR chủ động chuyển hồ sơ ra khỏi SCREENING_REJECTED (giữ lại để tham khảo sau này),
    // hủy lịch tự động xóa CV đang chờ xử lý cho các submission của hồ sơ này.
    if (
      oldPhase === ApplicationPhase.SCREENING_REJECTED &&
      dto.phase !== ApplicationPhase.SCREENING_REJECTED
    ) {
      await this.submissionRepo
        .createQueryBuilder()
        .update(ApplicationSubmission)
        .set({ cvPurgeAt: null })
        .where('application_id = :applicationId', { applicationId: id })
        .andWhere('is_cv_purged = false')
        .andWhere('cv_purge_at IS NOT NULL')
        .execute();
    }

    this.eventEmitter.emit(
      'application.phase_changed',
      new ApplicationPhaseChangedEvent(
        saved.id,
        saved.candidateId,
        saved.jobPostId ?? '',
        oldPhase,
        dto.phase,
        user.id || user.sub || 'SYSTEM',
        dto.internalHrNotes,
      ),
    );

    return saved;
  }

  // ========================================================
  // 3. DANH SÁCH PIPELINE KANBAN (TRIỆT TIÊU N+1 & LEAN SELECT)
  // ========================================================
  async findByJobPost(
    jobPostId: string,
    query: QueryJobApplicationsDto,
    user?: ExtendedUser,
  ) {
    const { page = 1, limit = 50, phase, search } = query;
    const skip = (page - 1) * limit;

    if (user) {
      const jobPost = await this.jobPostRepo.findOne({
        where: { id: jobPostId },
        select: {
          id: true,
          recruitmentRequestId: true,
        },
        relations: { recruitmentRequest: { department: true } },
      });

      if (!jobPost) {
        throw new NotFoundException(
          `Tin tuyển dụng ${jobPostId} không tồn tại.`,
        );
      }
      await this.assertJobViewPermission(jobPost, user);
    }

    // Tiêu chí 2 & 3: JOIN cụ thể, chỉ select các trường cần hiển thị trên Kanban card
    const qb = this.applicationRepo
      .createQueryBuilder('app')
      .innerJoin('app.candidate', 'candidate')
      .leftJoin('app.submissions', 'submissions')
      .select([
        'app.id',
        'app.status',
        'app.aiScore',
        'app.aiTier',
        'app.createdAt',
        'app.updatedAt',
        'candidate.id',
        'candidate.fullName',
        'candidate.email',
        'candidate.phoneNumber',
        'submissions.id',
        'submissions.platformSource',
        'submissions.cvUrl',
        'submissions.cvFileKey',
        'submissions.isCvPurged',
        'submissions.createdAt',
      ])
      .where('app.jobPostId = :jobPostId', { jobPostId });

    if (phase) {
      qb.andWhere('app.status = :phase', { phase });
    }

    if (search?.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(candidate.fullName) LIKE :term OR LOWER(candidate.email) LIKE :term OR candidate.phoneNumber LIKE :term)',
        { term },
      );
    }

    qb.orderBy('app.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  // ========================================================
  // 4. AUTOMATED 3-TIER SCREENING OUTCOME ROUTING
  // ========================================================
  // async applyScreeningOutcome(
  //   applicationId: string,
  //   result: AiScoreResult,
  // ): Promise<void> {
  //   const application = await this.applicationRepo.findOne({
  //     where: { id: applicationId },
  //     relations: {
  //       candidate: true,
  //       jobPost: true,
  //     },
  //   });

  //   if (!application) {
  //     throw new NotFoundException(
  //       `Hồ sơ ứng tuyển ${applicationId} không tồn tại.`,
  //     );
  //   }

  //   application.aiScore = result.aiScore;
  //   application.aiTier = result.aiTier;
  //   application.aiReasoning = result.aiReasoning;

  //   // ── Phân luồng trạng thái theo 3 cấp bậc ──
  //   switch (result.aiTier) {
  //     case AiScreeningTier.HIGH:
  //       // Tier 1 (≥ 80): Tuyển thẳng vào hàng đợi phỏng vấn
  //       application.status = ApplicationPhase.SHORTLISTED;
  //       break;

  //     case AiScreeningTier.MEDIUM:
  //       // Tier 2 (50 - 79): Đưa vào kho dự trữ tiềm năng
  //       application.status = ApplicationPhase.SAVED_POOL;
  //       break;

  //     case AiScreeningTier.LOW:
  //     default:
  //       // Tier 3 (< 50): Từ chối sơ loại, lưu trữ lịch sử cho kiểm toán
  //       application.status = ApplicationPhase.SCREENING_REJECTED;
  //       break;
  //   }

  //   const saved = await this.applicationRepo.save(application);

  //   // Bắn sự kiện hoàn thành sàng lọc CV
  //   this.eventEmitter.emit(
  //     'ats.cv_screened',
  //     new CandidateScreeningCompletedEvent(
  //       saved.id,
  //       saved.candidateId,
  //       saved.jobPostId,
  //       result.aiScore,
  //       result.aiTier,
  //       result.aiReasoning,
  //     ),
  //   );

  //   // Nếu đạt High Tier, kích hoạt thông báo phỏng vấn ngay cho HR & Trưởng bộ phận
  //   if (result.aiTier === AiScreeningTier.HIGH) {
  //     this.eventEmitter.emit(
  //       'ats.candidate_shortlisted',
  //       new CandidateShortlistedEvent(
  //         saved.id,
  //         saved.candidateId,
  //         saved.jobPostId,
  //         saved.candidate.fullName,
  //         saved.candidate.email,
  //         saved.jobPost.publicTitle,
  //         result.aiScore,
  //       ),
  //     );
  //   }
  // }
  async applyScreeningOutcome(
    applicationId: string,
    scoreResult: CvScoreResult,
    submissionId?: string,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: {
        candidate: true,
        jobPost: true,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Hồ sơ ứng tuyển ${applicationId} không tồn tại.`,
      );
    }

    // 1. Phân luồng chính xác theo các bậc chuẩn của AiScreeningTier
    let nextStatus: ApplicationPhase;

    switch (scoreResult.aiTier) {
      case AiScreeningTier.HIGH:
        nextStatus = ApplicationPhase.SHORTLISTED;
        break;

      case AiScreeningTier.LOW:
        nextStatus = ApplicationPhase.SCREENING_REJECTED;
        break;

      case AiScreeningTier.MEDIUM:
        nextStatus = ApplicationPhase.SAVED_POOL;
        break;

      case AiScreeningTier.NOT_AVAILABLE:
      default:
        // KHÔNG chấm được -> không tự phân luồng, chờ HR chấm lại thủ công.
        // Tuyệt đối không suy ra MEDIUM/SAVED_POOL từ việc thiếu điểm.
        nextStatus = ApplicationPhase.SCREENING_FAILED;
        break;
    }

    // 2. Cập nhật trạng thái tổng thể cho JobApplication.
    // aiScore = null khi tier N/A (không lưu giá trị mặc định).
    application.status = nextStatus;
    application.aiScore =
      scoreResult.aiTier === AiScreeningTier.NOT_AVAILABLE
        ? null
        : scoreResult.aiScore;
    application.aiTier = scoreResult.aiTier;
    application.aiReasoning = scoreResult.aiReasoning;

    const savedApp = await this.applicationRepo.save(application);

    // 3. Lưu vết điểm số độc lập cho từng submission
    let targetSubmission: ApplicationSubmission | null = null;

    if (submissionId) {
      targetSubmission = await this.submissionRepo.findOneBy({
        id: submissionId,
      });
    }

    if (!targetSubmission) {
      targetSubmission = await this.submissionRepo.findOne({
        where: { applicationId },
        order: { createdAt: 'DESC' },
      });
    }

    let purgeDeadline: Date | null = null;

    if (targetSubmission) {
      targetSubmission.aiScore =
        scoreResult.aiTier === AiScreeningTier.NOT_AVAILABLE
          ? null
          : scoreResult.aiScore;
      targetSubmission.aiTier = scoreResult.aiTier;
      targetSubmission.aiReasoning = scoreResult.aiReasoning;

      // 4. Nếu Tier LOW: KHÔNG xóa CV ngay. Cho HR 7 ngày để xem xét & cập nhật trạng thái
      // trước khi hệ thống tự động tiêu hủy CV khỏi S3 (xem CvRetentionCronService).
      if (scoreResult.aiTier === AiScreeningTier.LOW) {
        purgeDeadline = new Date();
        purgeDeadline.setDate(purgeDeadline.getDate() + CV_RETENTION_DAYS);

        this.logger.log(
          `[Low Tier Policy] Ứng viên thuộc tier LOW (${scoreResult.aiScore}đ). CV sẽ được HR xem xét trong ${CV_RETENTION_DAYS} ngày trước khi tự động bị xóa khỏi S3 vào ${purgeDeadline.toISOString()}.`,
        );

        targetSubmission.cvPurgeAt = purgeDeadline;
      }

      await this.submissionRepo.save(targetSubmission);
    }

    // 5. Kích hoạt Domain Events với đúng thứ tự tham số
    const currentSubmissionId = targetSubmission?.id ?? submissionId ?? null;
    this.eventEmitter.emit(
      'ats.cv_screened',
      new ApplicationScreeningCompletedEvent(
        savedApp.id,
        savedApp.candidateId,
        savedApp.jobPostId,
        savedApp.aiScore ?? null,
        scoreResult.aiTier,
        currentSubmissionId,
      ),
    );

    // 4. BẮN SỰ KIỆN THÔNG BÁO CHO HỆ THỐNG
    if (
      scoreResult.aiTier === AiScreeningTier.NOT_AVAILABLE ||
      scoreResult.aiScore === null
    ) {
      // Không có điểm -> không bắn sự kiện phân luồng (shortlist/pool/reject)
      // vì mọi thông báo đó đều hàm ý đã có kết quả chấm điểm.
      this.logger.warn(
        `[Scoring N/A] Application ${savedApp.id} không có điểm AI -> chuyển SCREENING_FAILED, chờ HR chấm điểm lại thủ công.`,
      );
    } else if (scoreResult.aiTier === AiScreeningTier.HIGH) {
      this.eventEmitter.emit(
        'ats.candidate_shortlisted',
        new CandidateShortlistedEvent(
          savedApp.id,
          savedApp.candidateId,
          savedApp.jobPostId ?? '',
          savedApp.candidate?.fullName ?? 'Ứng viên',
          savedApp.candidate?.email ?? '',
          savedApp.jobPost?.publicTitle ?? 'Vị trí tuyển dụng',
          scoreResult.aiScore,
          null, // hrRecipientId
          currentSubmissionId,
        ),
      );
    } else if (scoreResult.aiTier === AiScreeningTier.LOW) {
      this.eventEmitter.emit(
        'ats.candidate_rejected',
        new CandidateScreeningRejectedEvent(
          savedApp.id,
          savedApp.candidateId,
          savedApp.jobPostId ?? '',
          savedApp.candidate?.fullName ?? 'Ứng viên',
          scoreResult.aiScore,
          scoreResult.aiReasoning,
          currentSubmissionId,
          false, // isCvPurged: CV được giữ lại chờ HR xem xét trong thời gian bảo lưu
          savedApp.jobPost?.publicTitle ?? 'Vị trí tuyển dụng',
          purgeDeadline,
        ),
      );
    } else {
      this.eventEmitter.emit(
        'ats.candidate_pooled',
        new CandidatePooledEvent(
          savedApp.id,
          savedApp.candidateId,
          savedApp.jobPostId ?? '',
          savedApp.candidate?.fullName ?? 'Ứng viên',
          savedApp.jobPost?.publicTitle ?? 'Vị trí tuyển dụng',
          scoreResult.aiScore ?? 0,
          currentSubmissionId,
        ),
      );
    }

    return savedApp;
  }

  // ========================================================
  // 4B. HR CHỦ ĐỘNG CHẤM ĐIỂM LẠI SAU KHI SÀNG LỌC AI LỖI KỸ THUẬT
  // ========================================================
  async retryScreening(
    applicationId: string,
    user: ActiveUserData,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: {
        jobPost: {
          recruitmentRequest: {
            department: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ ứng tuyển ID: ${applicationId}`,
      );
    }

    await this.assertManagePermission(application, user);

    if (application.status !== ApplicationPhase.SCREENING_FAILED) {
      throw new ConflictException(
        `Chỉ có thể chấm điểm lại hồ sơ đang ở trạng thái SCREENING_FAILED. Trạng thái hiện tại: ${application.status}`,
      );
    }

    const targetSubmission = await this.submissionRepo.findOne({
      where: { applicationId },
      order: { createdAt: 'DESC' },
    });

    if (!targetSubmission) {
      throw new NotFoundException(
        `Hồ sơ ứng tuyển ${applicationId} không có lượt nộp CV nào để chấm điểm lại.`,
      );
    }

    application.status = ApplicationPhase.AI_SCREENING;
    application.internalHrNotes = application.internalHrNotes
      ? `${application.internalHrNotes}\n[${new Date().toISOString()}] HR (${user.fullName || user.id}) yêu cầu chấm điểm lại thủ công.`
      : `[${new Date().toISOString()}] HR (${user.fullName || user.id}) yêu cầu chấm điểm lại thủ công.`;
    application.updatedBy = user.id || user.sub;

    const saved = await this.applicationRepo.save(application);

    const uniqueJobId = `screen-retry-${applicationId}-${Date.now()}`;
    await this.screeningQueue.add(
      'process-cv',
      {
        applicationId: saved.id,
        submissionId: targetSubmission.id,
        candidateId: saved.candidateId,
        jobPostId: saved.jobPostId ?? '',
        cvFileKey: targetSubmission.cvFileKey,
        cvUrl: targetSubmission.cvUrl,
      },
      {
        jobId: uniqueJobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `[Manual Retry] HR (${user.id || user.sub}) đã yêu cầu chấm điểm lại Application: ${applicationId}`,
    );

    return saved;
  }

  // ========================================================
  // 5. PROMOTE CANDIDATE FROM SAVED_POOL (HR OVERRIDE)
  // ========================================================
  async promoteFromPool(
    applicationId: string,
    user: ActiveUserData,
    targetPhase:
      | ApplicationPhase.SHORTLISTED
      | ApplicationPhase.INTERVIEWING = ApplicationPhase.SHORTLISTED,
    note?: string,
  ): Promise<JobApplication> {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: {
        candidate: true,
        jobPost: {
          recruitmentRequest: {
            department: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ ứng tuyển ${applicationId}`,
      );
    }

    // Kiểm tra quyền hạn trước khi vớt ứng viên
    await this.assertManagePermission(application, user);

    if (application.status !== ApplicationPhase.SAVED_POOL) {
      throw new BadRequestException(
        `Chỉ có thể vớt ứng viên đang ở trạng thái SAVED_POOL. Trạng thái hiện tại: ${application.status}`,
      );
    }

    application.status = targetPhase;
    const historyNote = `[${new Date().toISOString()}] Vớt hồ sơ từ Kho dự phòng lên ${targetPhase} bởi ${user.fullName || user.id}. ${note || ''}`;
    application.internalHrNotes = application.internalHrNotes
      ? `${application.internalHrNotes}\n${historyNote}`
      : historyNote;
    application.updatedBy = user.id || user.sub;

    const saved = await this.applicationRepo.save(application);

    if (saved.jobPostId) {
      await this.invalidatePipelineCache(saved.jobPostId);
    }

    this.eventEmitter.emit(
      'ats.candidate_promoted',
      new ApplicationPromotedEvent(
        saved.id,
        saved.candidateId,
        saved.jobPostId,
        targetPhase, // Bổ sung tham số targetPhase (ApplicationPhase) vào đây
        user.id || user.sub || 'SYSTEM', // Tham số thứ 5: promotedById
        note, // Tham số thứ 6: note
      ),
    );

    return saved;
  }

  // ========================================================
  // GET ALL SUBMISSIONS FOR A SPECIFIC APPLICATION
  // ========================================================
  async findSubmissionsByApplicationId(
    applicationId: string,
    user?: ExtendedUser,
  ): Promise<ApplicationSubmission[]> {
    // 1. Kiểm tra sự tồn tại của hồ sơ ứng tuyển
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: {
        jobPost: {
          recruitmentRequest: {
            department: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ ứng tuyển với mã ID: ${applicationId}`,
      );
    }

    if (user && application.jobPost) {
      await this.assertJobViewPermission(application.jobPost, user);
    }
    // 2. Truy vấn toàn bộ lịch sử nộp CV của đợt ứng tuyển này
    return this.submissionRepo.find({
      where: { applicationId },
      order: { createdAt: 'DESC' },
    });
  }

  // ========================================================
  // 6. HR CHỦ ĐỘNG XÓA NGAY CV (KHÔNG CẦN CHỜ 7 NGÀY)
  // ========================================================
  async purgeCvNow(
    applicationId: string,
    submissionId: string,
    user: ActiveUserData,
  ): Promise<ApplicationSubmission> {
    const application = await this.applicationRepo.findOne({
      where: { id: applicationId },
      relations: {
        jobPost: {
          recruitmentRequest: {
            department: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ ứng tuyển ID: ${applicationId}`,
      );
    }

    await this.assertManagePermission(application, user);

    const submission = await this.submissionRepo.findOneBy({
      id: submissionId,
      applicationId,
    });

    if (!submission) {
      throw new NotFoundException(
        `Không tìm thấy lượt nộp CV ID: ${submissionId} thuộc hồ sơ ứng tuyển này.`,
      );
    }

    if (submission.isCvPurged || !submission.cvFileKey) {
      return submission;
    }

    this.logger.log(
      `[Manual Purge] HR (${user.id || user.sub}) yêu cầu xóa ngay CV ${submission.cvFileKey} khỏi S3.`,
    );

    await this.s3StorageService.deleteFile(submission.cvFileKey);

    submission.cvFileKey = null;
    submission.cvUrl = '';
    submission.isCvPurged = true;
    submission.cvPurgeAt = null;

    return this.submissionRepo.save(submission);
  }

  // ========================================================
  // PRIVATE HELPER & CACHE INVALIDATION
  // ========================================================
  private async invalidatePipelineCache(jobPostId: string): Promise<void> {
    await this.cacheService.del(`${this.PIPELINE_STATS_CACHE}:${jobPostId}`);
  }
  private extractJobDepartmentId(jobPost?: JobPost | null): string | undefined {
    if (!jobPost) return undefined;

    const req = jobPost.recruitmentRequest as unknown as
      Record<string, unknown> | null | undefined;

    if (req) {
      if (
        'departmentId' in req &&
        typeof req.departmentId === 'string' &&
        req.departmentId.length > 0
      ) {
        return req.departmentId;
      }

      if (
        'department' in req &&
        req.department &&
        typeof req.department === 'object'
      ) {
        const dept = req.department as { id?: unknown };
        if (typeof dept.id === 'string' && dept.id.length > 0) {
          return dept.id;
        }
      }
    }

    const jobRecord = jobPost as unknown as Record<string, unknown>;
    if (
      typeof jobRecord.departmentId === 'string' &&
      jobRecord.departmentId.length > 0
    ) {
      return jobRecord.departmentId;
    }

    return undefined;
  }
  private async assertManagePermission(
    application: JobApplication,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_candidate', 'update', 'any')) {
      return;
    }

    const canUpdateDept =
      hasPermission(user, 'ats_candidate', 'update', 'dept') ||
      hasPermission(user, 'ats_job_post', 'approve', 'dept');

    const userDeptId = await getUserDepartmentId(
      this.applicationRepo.manager,
      user,
    );
    const jobDeptId = this.extractJobDepartmentId(application.jobPost);

    const isOwnDept = Boolean(userDeptId && userDeptId === jobDeptId);

    if (!canUpdateDept || !isOwnDept) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật tiến trình ứng tuyển của vị trí thuộc phòng ban này.',
      );
    }
  }

  private async assertJobViewPermission(
    jobPost: JobPost,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_candidate', 'read', 'any')) {
      return;
    }

    const canReadDept = hasPermission(user, 'ats_candidate', 'read', 'dept');
    const userDeptId = await getUserDepartmentId(
      this.applicationRepo.manager,
      user,
    );
    const jobDeptId = this.extractJobDepartmentId(jobPost);

    const isOwnDept = Boolean(userDeptId && userDeptId === jobDeptId);

    if (!canReadDept || !isOwnDept) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào danh sách ứng viên của tin tuyển dụng này.',
      );
    }
  }

  private assertValidPhaseTransition(
    current: ApplicationPhase,
    target: ApplicationPhase,
  ): void {
    const allowed: Record<ApplicationPhase, ApplicationPhase[]> = {
      [ApplicationPhase.APPLIED]: [
        ApplicationPhase.AI_SCREENING,
        ApplicationPhase.SHORTLISTED,
        ApplicationPhase.SAVED_POOL,
        ApplicationPhase.SCREENING_REJECTED,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.AI_SCREENING]: [
        ApplicationPhase.SHORTLISTED,
        ApplicationPhase.SAVED_POOL,
        ApplicationPhase.SCREENING_REJECTED,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.SHORTLISTED]: [
        ApplicationPhase.INTERVIEWING,
        ApplicationPhase.SAVED_POOL,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.SAVED_POOL]: [
        ApplicationPhase.SHORTLISTED,
        ApplicationPhase.INTERVIEWING,
        ApplicationPhase.SCREENING_REJECTED,
      ],
      [ApplicationPhase.INTERVIEWING]: [
        ApplicationPhase.OFFERED,
        ApplicationPhase.SAVED_POOL,
        ApplicationPhase.SCREENING_REJECTED,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.OFFERED]: [
        ApplicationPhase.HIRED,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.HIRED]: [],
      [ApplicationPhase.SCREENING_REJECTED]: [
        ApplicationPhase.SAVED_POOL, // Cho phép khôi phục vào kho lưu trữ
      ],
      [ApplicationPhase.SCREENING_FAILED]: [
        ApplicationPhase.AI_SCREENING, // Dùng bởi retryScreening() khi HR bấm "Chấm điểm lại"
        ApplicationPhase.SAVED_POOL,
        ApplicationPhase.SCREENING_REJECTED,
        ApplicationPhase.WITHDRAWN,
      ],
      [ApplicationPhase.WITHDRAWN]: [],
    };

    if (!allowed[current]?.includes(target)) {
      throw new ConflictException(
        `Không thể chuyển đổi trạng thái hồ sơ từ ${current} sang ${target}.`,
      );
    }
  }
}
