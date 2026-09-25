import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, DeepPartial } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';

import { JobPost } from './entities/job-post.entity';
import { RecruitmentRequest } from './entities/recruitment-request.entity';
import {
  CreateJobPostDto,
  UpdateJobPostDto,
  ReviewJobPostDto,
  PublishJobPostDto,
  QueryJobPostDto,
} from './dto/job-post.dto';
import { JobPostStatus, RecruitmentRequestStatus } from './enums/ats.enum';
import { JobPublishingService } from './job-publishing.service';
import {
  JobPostApprovalRequestedEvent,
  JobPostClosedEvent,
  JobPostPublishedEvent,
  JobPostReviewedEvent,
} from './job-post.events';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
// import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { JobApplication } from './entities/job-application.entity';
import {
  // isSuperAdmin,
  hasPermission,
  getUserDepartmentId,
  ExtendedUser,
} from '../common/utils/ats-rbac.util';
import { Department } from 'src/departments/entities/department.entity';
import { CacheService } from 'src/common/cache/cache.service';

// export interface RoleObject {
//   id?: string;
//   name?: string;
//   code?: string;
//   slug?: string;
// }

// interface RawDepartmentQueryResult {
//   departmentId?: string;
//   id?: string;
// }

@Injectable()
export class JobPostsService {
  private readonly logger = new Logger(JobPostsService.name);
  private readonly CACHE_PREFIX = 'ats:job_posts';
  private readonly USER_DEPT_CACHE_PREFIX = 'user:department_scope';

  constructor(
    @InjectRepository(JobPost)
    private readonly jobPostRepo: Repository<JobPost>,
    @InjectRepository(RecruitmentRequest)
    private readonly reqRepo: Repository<RecruitmentRequest>,
    @InjectRepository(JobApplication)
    private readonly jobAppRepo: Repository<JobApplication>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly publishingService: JobPublishingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    @InjectQueue('job-publishing')
    private readonly publishQueue: Queue,
  ) {}

  // ========================================================
  // 1. CREATE DRAFT
  // ========================================================
  async createDraft(
    dto: CreateJobPostDto,
    user: ExtendedUser,
  ): Promise<JobPost> {
    let intakeReq: RecruitmentRequest | null = null;

    if (dto.recruitmentRequestId) {
      intakeReq = await this.reqRepo.findOne({
        where: { id: dto.recruitmentRequestId },
        relations: { department: true },
      });

      if (!intakeReq) {
        throw new NotFoundException(
          `Không tìm thấy Requisition ID: ${dto.recruitmentRequestId}`,
        );
      }

      const existingJob = await this.jobPostRepo.findOne({
        where: { recruitmentRequestId: dto.recruitmentRequestId },
        select: {
          id: true,
          jobCode: true,
          status: true,
        },
      });

      if (existingJob) {
        if (
          existingJob.status === JobPostStatus.DRAFT ||
          existingJob.status === JobPostStatus.PENDING_HEAD_APPROVAL
        ) {
          return await this.update(existingJob.id, user, dto);
        }
        throw new ConflictException(
          `Yêu cầu tuyển dụng này đã có bản tin tuyển dụng (${existingJob.jobCode}) ở trạng thái ${existingJob.status}.`,
        );
      }
    }

    const deadline = dto.applicationDeadline
      ? new Date(dto.applicationDeadline)
      : new Date(Date.now() + 30 * 86400000);

    if (isNaN(deadline.getTime())) {
      throw new BadRequestException(
        'Hạn nộp hồ sơ (applicationDeadline) không hợp lệ.',
      );
    }

    const scheduledDate = dto.scheduledPublishAt
      ? new Date(dto.scheduledPublishAt)
      : null;

    const { departmentId: rawDeptId, ...cleanDto } = dto as CreateJobPostDto & {
      departmentId?: string;
    };

    const targetDepartmentId =
      rawDeptId === 'GLOBAL' || !rawDeptId
        ? (intakeReq?.departmentId ?? undefined)
        : rawDeptId;

    const jobPostPayload: DeepPartial<JobPost> = {
      ...cleanDto,
      ...(targetDepartmentId ? { departmentId: targetDepartmentId } : {}),
      jobCode: this.generateJobCode(),
      status: JobPostStatus.DRAFT,
      isTemplate: false,
      applicationDeadline: deadline,
      scheduledPublishAt: scheduledDate,
      createdBy: user.id,
      updatedBy: user.id,
      ...(intakeReq
        ? {
            recruitmentRequest: intakeReq,
            recruitmentRequestId: intakeReq.id,
          }
        : {}),
    };

    const jobPost: JobPost = this.jobPostRepo.create(jobPostPayload);
    const saved: JobPost = await this.jobPostRepo.save(jobPost);

    if (intakeReq) {
      intakeReq.status = RecruitmentRequestStatus.DRAFTED;
      intakeReq.updatedBy = user.id;
      await this.reqRepo.save(intakeReq);
    }

    if (dto.requireHeadApproval) {
      return await this.sendForHeadApproval(saved.id, user);
    }

    return saved;
  }

  // ========================================================
  // 2. QUERYING & SCOPE ENFORCEMENT (OPTIMIZED)
  // ========================================================
  async findAll(query: QueryJobPostDto, user: ExtendedUser) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      status,
      level,
      platform,
      isTemplate,
    } = query;

    const skip = (page - 1) * limit;

    // Tiêu chí 2 & 3: Chỉ SELECT các cột cần thiết cho danh sách, bỏ các trường text lớn
    const qb = this.jobPostRepo
      .createQueryBuilder('job')
      .leftJoin('job.recruitmentRequest', 'recruitmentRequest')
      .leftJoin('recruitmentRequest.department', 'department')
      .select([
        'job.id',
        'job.jobCode',
        'job.publicTitle',
        'job.specialization',
        'job.domainKnowledge',
        'job.level',
        'job.jobType',
        'job.workingModel',
        'job.salaryMin',
        'job.salaryMax',
        'job.isSalaryNegotiable',
        'job.workLocations',
        'job.workingHoursStandard',
        'job.minEducation',
        'job.experienceYears',
        'job.gender',
        'job.applicationDeadline',
        'job.headcount',
        'job.campaignName',
        'job.status',
        'job.targetPlatforms',
        'job.isTemplate',
        'job.publishedAt',
        'job.scheduledPublishAt',
        'job.createdAt',
        'job.updatedAt',
        // Lean fields quan hệ
        'recruitmentRequest.id',
        'recruitmentRequest.requestCode',
        'recruitmentRequest.departmentId',
        'department.id',
        'department.name',
        'department.code',
      ]);

    // ── RBAC Scope Enforcement cho Job Posts ──
    const canReadAny = hasPermission(user, 'ats_job_post', 'read', 'any');
    const canReadDept = hasPermission(user, 'ats_job_post', 'read', 'dept');

    if (!canReadAny) {
      // const userDeptId = await getUserDepartmentId(
      //   this.jobPostRepo.manager,
      //   user,
      // );
      const userDeptId = await this.getCachedUserDepartmentId(user);

      if (canReadDept && userDeptId) {
        // Chỉ xem các job posts thuộc phòng ban của mình
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where('recruitmentRequest.departmentId = :scopedDeptId', {
                scopedDeptId: userDeptId,
              })
              .orWhere('department.id = :scopedDeptId', {
                scopedDeptId: userDeptId,
              });
          }),
        );
      } else {
        qb.andWhere('job.createdBy = :scopedUserId', { scopedUserId: user.id });
      }

      // ── Cập nhật: Cho phép xem PUBLISHED và PENDING_HEAD_APPROVAL ──
      if (!status) {
        qb.andWhere('job.status IN (:...allowedStatuses)', {
          allowedStatuses: [
            JobPostStatus.PUBLISHED,
            JobPostStatus.PENDING_HEAD_APPROVAL,
          ],
        });
      } else {
        qb.andWhere('job.status != :draftStatus', {
          draftStatus: JobPostStatus.DRAFT,
        });
      }
    }

    // ── Filters (Tận dụng B-Tree Index) ──
    // if (search) {
    //   qb.andWhere(
    //     new Brackets((sub) => {
    //       sub
    //         .where('LOWER(job.publicTitle) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         })
    //         .orWhere('LOWER(job.jobCode) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         })
    //         .orWhere('LOWER(job.specialization) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         });
    //     }),
    //   );
    // }
    if (search) {
      const cleanSearch = search.trim();
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('job.jobCode ILIKE :search', { search: `%${cleanSearch}%` })
            .orWhere('job.publicTitle ILIKE :search', {
              search: `%${cleanSearch}%`,
            })
            .orWhere('job.specialization ILIKE :search', {
              search: `%${cleanSearch}%`,
            });
        }),
      );
    }

    if (status) {
      const statusList = Array.isArray(status) ? status : [status];
      if (statusList.length > 0) {
        qb.andWhere('job.status IN (:...status)', { status: statusList });
      }
    }

    if (level) {
      qb.andWhere('job.level = :level', { level });
    }

    if (isTemplate !== undefined) {
      qb.andWhere('job.isTemplate = :isTemplate', { isTemplate });
    }

    if (platform) {
      const platformList = Array.isArray(platform) ? platform : [platform];
      if (platformList.length > 0) {
        qb.andWhere('job.targetPlatforms && :platform', {
          platform: platformList,
        });
      }
    }

    // Tiêu chí 1: Whitelist sắp xếp theo Index để tránh File Sort đĩa
    const validSortFields = [
      'createdAt',
      'publishedAt',
      'applicationDeadline',
      'status',
      'publicTitle',
    ];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    qb.orderBy(`job.${safeSortBy}`, sortOrder);
    qb.addOrderBy('job.id', sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // if (data.length > 0) {
    //   const jobIds = data.map((j) => j.id);

    //   const rawCounts = await this.jobPostRepo.manager
    //     .createQueryBuilder(JobApplication, 'app')
    //     .select('app.jobPostId', 'jobPostId')
    //     .addSelect('COUNT(app.id)', 'count')
    //     .where('app.jobPostId IN (:...jobIds)', { jobIds })
    //     .groupBy('app.jobPostId')
    //     .getRawMany<{ jobPostId: string; count: string }>();

    //   const countMap = new Map(
    //     rawCounts.map((item) => [item.jobPostId, parseInt(item.count, 10)]),
    //   );

    //   data.forEach((jobItem) => {
    //     jobItem.applicationsCount = countMap.get(jobItem.id) || 0;
    //   });
    // }
    // const userDeptId = await getUserDepartmentId(
    //   this.jobPostRepo.manager,
    //   user,
    // );
    // Tiêu chí 2: Batching đếm số lượng hồ sơ ứng tuyển (Triệt tiêu N+1 Query)
    if (data.length > 0) {
      const jobIds = data.map((j) => j.id);

      const rawCounts = await this.jobAppRepo
        .createQueryBuilder('app')
        .select('app.jobPostId', 'jobPostId')
        .addSelect('COUNT(app.id)', 'count')
        .where('app.jobPostId IN (:...jobIds)', { jobIds })
        .groupBy('app.jobPostId')
        .getRawMany<{ jobPostId: string; count: string }>();

      const countMap = new Map(
        rawCounts.map((item) => [item.jobPostId, parseInt(item.count, 10)]),
      );

      data.forEach((jobItem) => {
        (jobItem as JobPost & { applicationsCount: number }).applicationsCount =
          countMap.get(jobItem.id) || 0;
      });
    }

    const meta = PaginationMetaDto.create(page, limit, total);
    return { data, meta };
  }

  async getTemplates(): Promise<JobPost[]> {
    return this.jobPostRepo.find({
      where: { isTemplate: true },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
  }

  // ========================================================
  // 4. FIND ONE (LEAN DETAIL WITH CACHE, NO APP OVERLOAD)
  // ========================================================
  async findOne(idOrCode: string, user?: ExtendedUser): Promise<JobPost> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrCode,
      );
    const cacheKey = `${this.CACHE_PREFIX}:detail:${idOrCode}`;

    let jobPost = await this.cacheService.get<JobPost>(cacheKey);

    if (!jobPost) {
      // Tiêu chí 2 & 3: Bỏ hoàn toàn việc join toàn bộ applications, candidate, submissions
      const qb = this.jobPostRepo
        .createQueryBuilder('job')
        .leftJoinAndSelect('job.recruitmentRequest', 'recruitmentRequest')
        .leftJoinAndSelect('recruitmentRequest.department', 'department')
        .addSelect([
          'job.jobDescription',
          'job.requirements',
          'job.benefits',
          'job.extraBenefits',
          'job.workingHoursDetail',
        ]);

      if (isUuid) {
        qb.where('job.id = :id', { id: idOrCode });
      } else {
        qb.where('job.jobCode = :code', { code: idOrCode });
      }

      jobPost = await qb.getOne();

      if (!jobPost) {
        throw new NotFoundException(
          `Không tìm thấy tin tuyển dụng với mã: ${idOrCode}`,
        );
      }

      await this.cacheService.set(cacheKey, jobPost, 600); // Cache 10 phút
    }

    if (user) {
      await this.assertViewPermission(jobPost, user);
    }

    return jobPost;
  }

  // ========================================================
  // 5. UPDATE
  // ========================================================
  async update(
    id: string,
    user: ExtendedUser,
    dto: UpdateJobPostDto,
  ): Promise<JobPost> {
    const jobPost = await this.findOne(id, user);

    if (
      jobPost.status !== JobPostStatus.DRAFT &&
      jobPost.status !== JobPostStatus.PENDING_HEAD_APPROVAL
    ) {
      throw new ConflictException(
        `Không thể sửa tin tuyển dụng khi ở trạng thái "${jobPost.status}". Chỉ cho phép sửa ở trạng thái DRAFT hoặc PENDING_HEAD_APPROVAL.`,
      );
    }

    const {
      departmentId: rawDeptId,
      applicationDeadline,
      scheduledPublishAt,
      id: _forbiddenId,
      status: _forbiddenStatus,
      jobCode: _forbiddenCode,
      recruitmentRequestId: _forbiddenReqId,
      createdBy: _forbiddenCreatedBy,
      createdAt: _forbiddenCreatedAt,
      updatedAt: _forbiddenUpdatedAt,
      ...cleanDto
    } = dto as UpdateJobPostDto & {
      departmentId?: string;
      id?: string;
      status?: JobPostStatus;
      jobCode?: string;
      recruitmentRequestId?: string;
      createdBy?: string;
      createdAt?: Date;
      updatedAt?: Date;
    };

    Object.assign(jobPost, cleanDto);

    const isValidUuid = (val?: string) =>
      Boolean(
        val &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          val,
        ),
      );

    if (
      rawDeptId &&
      rawDeptId !== 'GLOBAL' &&
      isValidUuid(rawDeptId) &&
      jobPost.recruitmentRequest
    ) {
      jobPost.recruitmentRequest.departmentId = rawDeptId;
      await this.reqRepo.save(jobPost.recruitmentRequest);
    }

    if (applicationDeadline !== undefined) {
      const deadline = new Date(applicationDeadline);
      if (isNaN(deadline.getTime())) {
        throw new BadRequestException(
          'Hạn nộp hồ sơ (applicationDeadline) không hợp lệ.',
        );
      }
      jobPost.applicationDeadline = deadline;
    }

    if (scheduledPublishAt !== undefined) {
      if (scheduledPublishAt) {
        const scheduledDate = new Date(scheduledPublishAt);
        if (isNaN(scheduledDate.getTime())) {
          throw new BadRequestException(
            'Thời gian lên lịch đăng (scheduledPublishAt) không hợp lệ.',
          );
        }
        jobPost.scheduledPublishAt = scheduledDate;
      } else {
        jobPost.scheduledPublishAt = null;
      }
    }

    jobPost.updatedBy = user.id;
    const saved = await this.jobPostRepo.save(jobPost);

    // Tiêu chí 4: Xóa cache chủ động
    await this.invalidateJobPostCache(saved);

    return saved;
  }

  // ========================================================
  // 6. ROUTE TO DEPARTMENT HEAD FOR REVIEW
  // ========================================================
  async sendForHeadApproval(id: string, user: ExtendedUser): Promise<JobPost> {
    const jobPost = await this.findOne(id, user);

    if (jobPost.status !== JobPostStatus.DRAFT) {
      throw new ConflictException(
        'Chỉ có bản tin DRAFT mới có thể gửi phê duyệt cho Trưởng bộ phận.',
      );
    }

    jobPost.status = JobPostStatus.PENDING_HEAD_APPROVAL;
    jobPost.updatedBy = user.id;

    if (jobPost.recruitmentRequest) {
      jobPost.recruitmentRequest.status =
        RecruitmentRequestStatus.PENDING_HEAD_APPROVAL;
      await this.reqRepo.save(jobPost.recruitmentRequest);
    }

    const saved = await this.jobPostRepo.save(jobPost);
    await this.invalidateJobPostCache(saved);

    const deptHeadId = jobPost.recruitmentRequest?.requesterId || user.id;

    this.eventEmitter.emit(
      'job_post.approval_requested',
      new JobPostApprovalRequestedEvent(
        saved.id,
        saved.jobCode,
        saved.publicTitle,
        user.id,
        deptHeadId,
      ),
    );

    return saved;
  }

  // ========================================================
  // 7. DEPARTMENT HEAD REVIEW
  // ========================================================
  async reviewByHead(
    id: string,
    user: ExtendedUser,
    dto: ReviewJobPostDto,
  ): Promise<JobPost> {
    const jobPost = await this.findOne(id, user);

    if (
      jobPost.status !== JobPostStatus.PENDING_HEAD_APPROVAL &&
      jobPost.status !== JobPostStatus.DRAFT
    ) {
      throw new ConflictException(
        'Bản tin không nằm trong hàng đợi chờ Trưởng bộ phận xét duyệt hoặc bản thảo.',
      );
    }

    const canApproveAny = hasPermission(user, 'ats_job_post', 'approve', 'any');
    const canApproveDept = hasPermission(
      user,
      'ats_job_post',
      'approve',
      'dept',
    );

    const userDeptId = await this.getCachedUserDepartmentId(user);
    const jobDeptId = this.getJobDepartmentId(jobPost);
    const isOwnDept = Boolean(userDeptId && userDeptId === jobDeptId);

    if (!canApproveAny && (!canApproveDept || !isOwnDept)) {
      throw new ForbiddenException(
        'Bạn không có quyền xét duyệt tin tuyển dụng của phòng ban này.',
      );
    }

    const reviewFeedback = dto.reviewNotes ?? '';

    if (dto.isApproved) {
      jobPost.status = JobPostStatus.DRAFT;
      if (jobPost.recruitmentRequest) {
        jobPost.recruitmentRequest.status = RecruitmentRequestStatus.APPROVED;
        jobPost.recruitmentRequest.rejectionReason = null;
        await this.reqRepo.save(jobPost.recruitmentRequest);
      }
    } else {
      jobPost.status = JobPostStatus.DRAFT;
      if (jobPost.recruitmentRequest) {
        jobPost.recruitmentRequest.status = RecruitmentRequestStatus.REJECTED;
        jobPost.recruitmentRequest.rejectionReason = reviewFeedback;
        await this.reqRepo.save(jobPost.recruitmentRequest);
      }
    }

    jobPost.updatedBy = user.id;
    const saved = await this.jobPostRepo.save(jobPost);
    await this.invalidateJobPostCache(saved);

    this.eventEmitter.emit(
      'job_post.reviewed',
      new JobPostReviewedEvent(
        saved.id,
        saved.jobCode,
        user.id,
        dto.isApproved,
        reviewFeedback,
      ),
    );

    return saved;
  }

  // ========================================================
  // 8. MULTI-PLATFORM PUBLISHING
  // ========================================================
  async publish(
    id: string,
    user: ExtendedUser,
    dto: PublishJobPostDto,
  ): Promise<JobPost> {
    const jobPost = await this.findOne(id, user);

    if (jobPost.status === JobPostStatus.PUBLISHED) {
      throw new ConflictException('Tin tuyển dụng này đã được xuất bản.');
    }

    const publishDto = dto as PublishJobPostDto & {
      bypassHeadApproval?: boolean;
    };

    if (
      jobPost.status === JobPostStatus.PENDING_HEAD_APPROVAL &&
      !publishDto.bypassHeadApproval
    ) {
      throw new BadRequestException(
        'Tin tuyển dụng đang chờ Trưởng ban phê duyệt. Vui lòng phê duyệt trước khi đăng tải.',
      );
    }

    jobPost.targetPlatforms = dto.targetPlatforms;
    jobPost.isTemplate = true;

    const now = Date.now();
    const scheduledTime = dto.scheduledPublishAt
      ? new Date(dto.scheduledPublishAt).getTime()
      : null;

    if (scheduledTime && scheduledTime > now) {
      const delayMs = scheduledTime - now;
      jobPost.scheduledPublishAt = new Date(scheduledTime);
      jobPost.updatedBy = user.id;

      await this.publishQueue.add(
        'publish-job',
        { jobPostId: jobPost.id, publishedById: user.id },
        { delay: delayMs, removeOnComplete: true },
      );

      const scheduled = await this.jobPostRepo.save(jobPost);
      await this.invalidateJobPostCache(scheduled);
      return scheduled;
    }

    const mapping = await this.publishingService.dispatchToPlatforms(jobPost);

    jobPost.status = JobPostStatus.PUBLISHED;
    jobPost.publishedAt = new Date();
    jobPost.externalMapping = mapping;
    jobPost.updatedBy = user.id;

    const saved = await this.jobPostRepo.save(jobPost);

    if (jobPost.recruitmentRequest) {
      jobPost.recruitmentRequest.status = RecruitmentRequestStatus.APPROVED;
      await this.reqRepo.save(jobPost.recruitmentRequest);
    }

    this.eventEmitter.emit(
      'job_post.published',
      new JobPostPublishedEvent(
        saved.id,
        saved.jobCode,
        saved.publicTitle,
        saved.targetPlatforms,
        saved.externalMapping,
        user.id,
      ),
    );

    return saved;
  }

  // ========================================================
  // 9. CLOSE JOB POST
  // ========================================================
  async closeJob(id: string, user: ExtendedUser): Promise<JobPost> {
    const jobPost = await this.findOne(id, user);

    if (jobPost.status !== JobPostStatus.PUBLISHED) {
      throw new BadRequestException(
        'Chỉ có tin đang PUBLISHED mới có thể đóng lại.',
      );
    }

    await this.publishingService.unlistFromPlatforms(jobPost);

    jobPost.status = JobPostStatus.CLOSED;
    jobPost.updatedBy = user.id;

    const saved = await this.jobPostRepo.save(jobPost);

    if (jobPost.recruitmentRequest) {
      jobPost.recruitmentRequest.status = RecruitmentRequestStatus.COMPLETED;
      await this.reqRepo.save(jobPost.recruitmentRequest);
    }

    await this.invalidateJobPostCache(saved);

    this.eventEmitter.emit(
      'job_post.closed',
      new JobPostClosedEvent(
        saved.id,
        saved.jobCode,
        user.id,
        saved.externalMapping,
      ),
    );

    return saved;
  }

  // ========================================================
  // 10. HELPER & CACHING UTILITIES
  // ========================================================
  private async getCachedUserDepartmentId(
    user: ExtendedUser,
  ): Promise<string | null> {
    if (user.departmentId && user.departmentId !== 'GLOBAL') {
      return user.departmentId;
    }

    const cacheKey = `${this.USER_DEPT_CACHE_PREFIX}:${user.id}`;
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const deptId = await getUserDepartmentId(this.jobPostRepo.manager, user);
    if (deptId) {
      await this.cacheService.set(cacheKey, deptId, 900); // 15 phút
    }

    return deptId ?? null;
  }

  private async invalidateJobPostCache(jobPost: JobPost): Promise<void> {
    try {
      const keys = [
        `${this.CACHE_PREFIX}:detail:${jobPost.id}`,
        `${this.CACHE_PREFIX}:detail:${jobPost.jobCode}`,
      ];

      if (jobPost.isTemplate) {
        keys.push(`${this.CACHE_PREFIX}:templates`);
      }

      await Promise.all(keys.map((k) => this.cacheService.del(k)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to invalidate job post cache: ${msg}`);
    }
  }

  private async assertViewPermission(
    jobPost: JobPost,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_job_post', 'read', 'any')) {
      return;
    }

    const userDeptId = await this.getCachedUserDepartmentId(user);
    const canReadDept = hasPermission(user, 'ats_job_post', 'read', 'dept');

    const jobDeptId = this.getJobDepartmentId(jobPost);
    const isOwnDept =
      canReadDept && Boolean(userDeptId && userDeptId === jobDeptId);
    const isCreator = user.id === jobPost.createdBy;

    if (!isOwnDept && !isCreator) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào tin tuyển dụng này.',
      );
    }

    // Nếu là Trưởng ban và tin còn là bản nháp nội bộ DRAFT (chưa gửi duyệt và chưa đăng)
    if (
      !isCreator &&
      jobPost.status === JobPostStatus.DRAFT &&
      !hasPermission(user, 'ats_job_post', 'create', 'any') &&
      !hasPermission(user, 'ats_job_post', 'update', 'any')
    ) {
      throw new ForbiddenException(
        'Bản tin đang trong quá trình soạn thảo nội bộ của bộ phận nhân sự.',
      );
    }
  }

  private generateJobCode(): string {
    const year = new Date().getFullYear();
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `JOB-${year}-${suffix}`;
  }

  /**
   * Trích xuất departmentId từ JobPost hoặc RecruitmentRequest liên kết một cách type-safe
   */
  private getJobDepartmentId(jobPost: JobPost): string | undefined {
    // 1. Kiểm tra qua recruitmentRequest nếu có
    const req = jobPost.recruitmentRequest;
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

    // 2. Kiểm tra nếu jobPost có trường departmentId hoặc department
    const jobRecord = jobPost as unknown as Record<string, unknown>;
    if (
      typeof jobRecord.departmentId === 'string' &&
      jobRecord.departmentId.length > 0
    ) {
      return jobRecord.departmentId;
    }

    if (
      jobRecord.department &&
      typeof jobRecord.department === 'object' &&
      jobRecord.department !== null
    ) {
      const dept = jobRecord.department as { id?: unknown };
      if (typeof dept.id === 'string' && dept.id.length > 0) {
        return dept.id;
      }
    }

    return undefined;
  }
}
