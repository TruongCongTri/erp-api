import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';

import { RecruitmentRequest } from './entities/recruitment-request.entity';
import {
  CreateRecruitmentRequestDto,
  UpdateRecruitmentRequestDto,
  ReviewRecruitmentRequestDto,
  QueryRecruitmentRequestDto,
} from './dto/recruitment-request.dto';
import { RecruitmentRequestStatus } from './enums/ats.enum';
import {
  RecruitmentRequestCreatedEvent,
  RecruitmentRequestReviewedEvent,
  RecruitmentRequestStatusChangedEvent,
} from './recruitment-request.events';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
// import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { Department } from 'src/departments/entities/department.entity';
import {
  // isSuperAdmin,
  hasPermission,
  getUserDepartmentId,
  ExtendedUser,
} from '../common/utils/ats-rbac.util';
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
export class RecruitmentRequestService {
  private readonly logger = new Logger(RecruitmentRequestService.name);

  // Prefix key cho Redis Caching
  private readonly CACHE_PREFIX = 'ats:recruitment_request';
  private readonly DEPT_CACHE_PREFIX = 'system:department';
  private readonly USER_DEPT_CACHE_PREFIX = 'user:department_scope';

  constructor(
    @InjectRepository(RecruitmentRequest)
    private readonly requestRepo: Repository<RecruitmentRequest>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
  ) {}

  // ==========================================
  // 1. CREATE REQUISITION (DEPARTMENT HEAD)
  // ==========================================
  async create(
    dto: CreateRecruitmentRequestDto,
    user: ExtendedUser,
  ): Promise<RecruitmentRequest> {
    let targetDeptId = dto.departmentId;

    if (!targetDeptId) {
      // const userDeptId = await getUserDepartmentId(
      //   this.requestRepo.manager,
      //   user,
      // );
      const userDeptId = await this.getCachedUserDepartmentId(user);
      if (userDeptId && userDeptId !== 'GLOBAL') {
        targetDeptId = userDeptId;
      }
    }

    if (!targetDeptId || targetDeptId === 'GLOBAL') {
      throw new BadRequestException(
        'Vui lòng chọn phòng ban tiếp nhận yêu cầu tuyển dụng.',
      );
    }

    // ── Tiêu chí 4: Cache kiểm tra phòng ban (loại bỏ query DB lặp lại) ──
    // const department = await this.departmentRepo.findOneBy({
    //   id: targetDeptId,
    // });
    // if (!department) {
    //   throw new BadRequestException('Phòng ban được chọn không tồn tại.');
    // }
    const department = await this.getCachedDepartment(targetDeptId);
    if (!department || !department.isActive) {
      throw new BadRequestException(
        'Phòng ban không tồn tại hoặc đã ngừng hoạt động.',
      );
    }

    const canCreateAny = hasPermission(
      user,
      'ats_requisition',
      'create',
      'any',
    );
    const canCreateDept = hasPermission(
      user,
      'ats_requisition',
      'create',
      'dept',
    );
    // const userDeptId = await getUserDepartmentId(
    //   this.requestRepo.manager,
    //   user,
    // );
    const userDeptId = await this.getCachedUserDepartmentId(user);

    if (
      !canCreateAny &&
      (!canCreateDept || (userDeptId && userDeptId !== targetDeptId))
    ) {
      throw new ForbiddenException(
        'Bạn chỉ có quyền tạo yêu cầu tuyển dụng cho phòng ban của mình phụ trách.',
      );
    }

    const requestCode = this.generateRequestCode();

    const requisition = this.requestRepo.create({
      requestCode,
      rawRequestNote: dto.rawRequestNote,
      status: RecruitmentRequestStatus.PENDING_HR,
      requesterId: user.id,
      departmentId: targetDeptId,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const saved = await this.requestRepo.save(requisition);

    this.eventEmitter.emit(
      'recruitment.request.created',
      new RecruitmentRequestCreatedEvent(
        saved.id,
        saved.requestCode,
        user.id,
        user.fullName ?? 'Department Head',
        targetDeptId,
        saved.rawRequestNote,
      ),
    );

    return saved;
  }

  // ==========================================
  // 2. QUERY & DATA SCOPE ENFORCEMENT (OPTIMIZED)
  // ==========================================
  async findAll(query: QueryRecruitmentRequestDto, user: ExtendedUser) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      status,
      departmentId,
      requesterId,
      fromDate,
      toDate,
    } = query;

    const skip = (page - 1) * limit;
    // ── Tiêu chí 2 & 3: Triệt tiêu N+1 và Giảm tải Payload RESTful ──
    // Chỉ JOIN các bảng cần thiết và SELECT đúng trường để tối ưu hóa bộ nhớ và serialization
    const qb = this.requestRepo
      .createQueryBuilder('req')
      .leftJoin('req.requester', 'requester')
      .leftJoin('req.department', 'department')
      .leftJoin('req.jobPost', 'jobPost')
      .select([
        // Recruitment Request core fields (LOẠI BỎ rawRequestNote và rejectionReason để giảm payload)
        'req.id',
        'req.requestCode',
        'req.status',
        'req.departmentId',
        'req.requesterId',
        'req.createdAt',
        'req.updatedAt',
        // Requester lean fields (tránh lộ thông tin nhạy cảm của user)
        'requester.id',
        'requester.fullName',
        'requester.email',
        // Department lean fields
        'department.id',
        'department.name',
        'department.code',
        // Linked JobPost status (nếu đã tạo tin)
        'jobPost.id',
        'jobPost.title',
        'jobPost.status',
      ]);

    // ── Phân Quyền Hiển Thị Danh Sách (RBAC Scope) ──
    const canReadAny = hasPermission(user, 'ats_requisition', 'read', 'any');
    const canReadDept = hasPermission(user, 'ats_requisition', 'read', 'dept');

    if (!canReadAny) {
      // const userDeptId = await getUserDepartmentId(
      //   this.requestRepo.manager,
      //   user,
      // );
      const userDeptId = await this.getCachedUserDepartmentId(user);

      if (canReadDept && userDeptId) {
        // Trưởng ban xem toàn bộ yêu cầu trong phòng ban mình hoặc do chính mình tạo
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where('req.departmentId = :scopedDeptId', {
                scopedDeptId: userDeptId,
              })
              .orWhere('req.requesterId = :scopedUserId', {
                scopedUserId: user.id,
              });
          }),
        );
      } else {
        // Nhân viên không có quyền dept chỉ xem các yêu cầu do chính mình gửi
        qb.andWhere('req.requesterId = :scopedUserId', {
          scopedUserId: user.id,
        });
      }
    }

    // ── Bộ Lọc Tìm Kiếm ──
    // if (search) {
    //   qb.andWhere(
    //     new Brackets((sub) => {
    //       sub
    //         .where('LOWER(req.requestCode) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         })
    //         .orWhere('LOWER(req.rawRequestNote) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         })
    //         .orWhere('LOWER(requester.fullName) LIKE LOWER(:search)', {
    //           search: `%${search}%`,
    //         });
    //     }),
    //   );
    // }
    if (search) {
      const cleanSearch = search.trim();
      // Ưu tiên so khớp requestCode trước (tận dụng B-tree index)
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('req.requestCode ILIKE :search', {
              search: `%${cleanSearch}%`,
            })
            .orWhere('requester.fullName ILIKE :search', {
              search: `%${cleanSearch}%`,
            });
        }),
      );
    }

    if (status) {
      qb.andWhere('req.status = :status', { status });
    }

    if (departmentId && canReadAny) {
      qb.andWhere('req.departmentId = :departmentId', { departmentId });
    }

    if (requesterId && canReadAny) {
      qb.andWhere('req.requesterId = :requesterId', { requesterId });
    }

    if (fromDate) qb.andWhere('req.createdAt >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('req.createdAt <= :toDate', { toDate });

    // ── Phân Trang Tận Dụng Composite Index ──
    // Đảm bảo ORDER BY đồng nhất với index idx_rec_req_status_created hoặc idx_rec_req_created_at
    // qb.orderBy(`req.${sortBy}`, sortOrder);
    // qb.addOrderBy('req.id', sortOrder);
    const safeSortBy = ['createdAt', 'status', 'requestCode'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    qb.orderBy(`req.${safeSortBy}`, sortOrder);
    qb.addOrderBy('req.id', sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  // ==========================================
  // 3. GET ONE (DETAIL VIEW VỚI HOT CACHE)
  // ==========================================
  async findOne(id: string, user: ExtendedUser): Promise<RecruitmentRequest> {
    const cacheKey = `${this.CACHE_PREFIX}:${id}`;

    // ── Tiêu chí 4: Cache kết quả đọc chi tiết (Hot read) ──
    let requisition = await this.cacheService.get<RecruitmentRequest>(cacheKey);

    // const requisition = await this.requestRepo.findOne({
    //   where: { id },
    //   relations: {
    //     requester: true,
    //     department: true,
    //     jobPost: true,
    //   },
    // });

    // if (!requisition) {
    //   throw new NotFoundException(
    //     `Không tìm thấy yêu cầu tuyển dụng với mã ID: ${id}`,
    //   );
    // }
    if (!requisition) {
      // Khi xem chi tiết mới tải đầy đủ rawRequestNote và rejectionReason
      requisition = await this.requestRepo.findOne({
        where: { id },
        relations: {
          requester: true,
          department: true,
          jobPost: true,
        },
      });

      if (!requisition) {
        throw new NotFoundException(
          `Không tìm thấy yêu cầu tuyển dụng với mã ID: ${id}`,
        );
      }

      // Cache chi tiết trong 300 giây (5 phút)
      await this.cacheService.set(cacheKey, requisition, 300);
    }

    await this.assertViewPermission(requisition, user);
    return requisition;
  }

  // ==========================================
  // 4. EDIT RAW PROMPT (PRE-DRAFT STAGES)
  // ==========================================
  async update(
    id: string,
    dto: UpdateRecruitmentRequestDto,
    user: ExtendedUser,
  ): Promise<RecruitmentRequest> {
    const requisition = await this.findOne(id, user);

    if (
      requisition.status !== RecruitmentRequestStatus.PENDING_HR &&
      requisition.status !== RecruitmentRequestStatus.REJECTED
    ) {
      throw new ConflictException(
        `Chỉ có thể chỉnh sửa yêu cầu khi ở trạng thái PENDING_HR hoặc REJECTED. Trạng thái hiện tại: ${requisition.status}`,
      );
    }

    const canUpdateAny = hasPermission(
      user,
      'ats_requisition',
      'update',
      'any',
    );
    const canUpdateDept = hasPermission(
      user,
      'ats_requisition',
      'update',
      'dept',
    );
    const userDeptId = await getUserDepartmentId(
      this.requestRepo.manager,
      user,
    );

    const isOwnDept =
      canUpdateDept &&
      Boolean(userDeptId && userDeptId === requisition.departmentId);
    const isRequester = requisition.requesterId === user.id;

    if (!canUpdateAny && !isOwnDept && !isRequester) {
      throw new ForbiddenException(
        'Bạn không có quyền sửa đổi nội dung yêu cầu tuyển dụng này.',
      );
    }

    requisition.rawRequestNote = dto.rawRequestNote;
    if (requisition.status === RecruitmentRequestStatus.REJECTED) {
      requisition.status = RecruitmentRequestStatus.PENDING_HR;
      requisition.rejectionReason = null;
    }
    requisition.updatedBy = user.id;

    const saved = await this.requestRepo.save(requisition);

    // ── Tiêu chí 4: Cache Invalidation ──
    await this.invalidateRequisitionCache(id);

    return saved;
  }

  // ==========================================
  // 5. REVIEW WORKFLOW (DEPT HEAD FINAL SIGN-OFF)
  // ==========================================
  async review(
    id: string,
    dto: ReviewRecruitmentRequestDto,
    user: ExtendedUser,
  ): Promise<RecruitmentRequest> {
    const requisition = await this.findOne(id, user);

    if (requisition.status !== RecruitmentRequestStatus.PENDING_HEAD_APPROVAL) {
      throw new ConflictException(
        `Yêu cầu tuyển dụng chỉ có thể phê duyệt khi đang ở trạng thái PENDING_HEAD_APPROVAL. Trạng thái hiện tại: ${requisition.status}`,
      );
    }
    const canApproveAny =
      hasPermission(user, 'ats_requisition', 'approve', 'any') ||
      hasPermission(user, 'ats_requisition', 'update', 'any');
    const canApproveDept =
      hasPermission(user, 'ats_requisition', 'approve', 'dept') ||
      hasPermission(user, 'ats_requisition', 'update', 'dept');

    // const userDeptId = await getUserDepartmentId(
    //   this.requestRepo.manager,
    //   user,
    // );
    const userDeptId = await this.getCachedUserDepartmentId(user);
    const isOwnDept = Boolean(
      userDeptId && userDeptId === requisition.departmentId,
    );

    if (!canApproveAny && (!canApproveDept || !isOwnDept)) {
      throw new ForbiddenException(
        'Bạn không có quyền phê duyệt yêu cầu tuyển dụng của phòng ban này.',
      );
    }

    const oldStatus = requisition.status;
    requisition.status = dto.status;
    requisition.rejectionReason =
      dto.status === RecruitmentRequestStatus.REJECTED
        ? (dto.rejectionReason ?? null)
        : null;
    requisition.updatedBy = user.id;

    const saved = await this.requestRepo.save(requisition);

    // ── Tiêu chí 4: Cache Invalidation ──
    await this.invalidateRequisitionCache(id);

    this.eventEmitter.emit(
      'recruitment.request.reviewed',
      new RecruitmentRequestReviewedEvent(
        saved.id,
        saved.requestCode,
        user.id,
        user.fullName ?? 'Approver',
        dto.status,
        dto.rejectionReason,
      ),
    );

    this.eventEmitter.emit(
      'recruitment.request.status_changed',
      new RecruitmentRequestStatusChangedEvent(
        saved.id,
        saved.requestCode,
        oldStatus,
        dto.status,
        user.id,
        dto.rejectionReason,
      ),
    );

    return saved;
  }

  // ==========================================
  // 6. CANCEL REQUISITION
  // ==========================================
  async cancel(id: string, user: ExtendedUser): Promise<RecruitmentRequest> {
    const requisition = await this.findOne(id, user);

    if (
      requisition.status === RecruitmentRequestStatus.APPROVED ||
      requisition.status === RecruitmentRequestStatus.COMPLETED
    ) {
      throw new ConflictException(
        `Không thể hủy yêu cầu đã được APPROVED hoặc COMPLETED. Trạng thái hiện tại: ${requisition.status}`,
      );
    }

    const canCancelAny =
      hasPermission(user, 'ats_requisition', 'delete', 'any') ||
      hasPermission(user, 'ats_requisition', 'update', 'any');
    const canCancelDept =
      hasPermission(user, 'ats_requisition', 'delete', 'dept') ||
      hasPermission(user, 'ats_requisition', 'update', 'dept');
    // const userDeptId = await getUserDepartmentId(
    //   this.requestRepo.manager,
    //   user,
    // );
    const userDeptId = await this.getCachedUserDepartmentId(user);
    const isOwnDept = Boolean(
      userDeptId && userDeptId === requisition.departmentId,
    );
    const isRequester = requisition.requesterId === user.id;

    if (!canCancelAny && (!canCancelDept || !isOwnDept) && !isRequester) {
      throw new ForbiddenException(
        'Bạn không có quyền hủy yêu cầu tuyển dụng này.',
      );
    }

    const oldStatus = requisition.status;
    requisition.status = RecruitmentRequestStatus.CANCELLED;
    requisition.updatedBy = user.id;

    const saved = await this.requestRepo.save(requisition);

    this.eventEmitter.emit(
      'recruitment.request.status_changed',
      new RecruitmentRequestStatusChangedEvent(
        saved.id,
        saved.requestCode,
        oldStatus,
        RecruitmentRequestStatus.CANCELLED,
        user.id,
        'Yêu cầu bị hủy bởi người dùng',
      ),
    );

    return saved;
  }

  // ==========================================
  // 7. INTERNAL TRANSITION & UTILS
  // ==========================================
  async transitionStatus(
    id: string,
    targetStatus: RecruitmentRequestStatus,
    updatedById: string,
  ): Promise<RecruitmentRequest> {
    const requisition = await this.requestRepo.findOneBy({ id });
    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found.`);
    }

    this.assertValidTransition(requisition.status, targetStatus);
    requisition.status = targetStatus;
    requisition.updatedBy = updatedById;

    const saved = await this.requestRepo.save(requisition);

    // Xóa cache chi tiết để các request sau đọc dữ liệu mới nhất
    await this.invalidateRequisitionCache(id);

    return saved;
  }

  // ==========================================
  // 8. HELPER & CACHE MANAGEMENT
  // ==========================================

  /**
   * Lấy Department có hỗ trợ Caching O(1) từ Redis/Memory
   */
  private async getCachedDepartment(
    deptId: string,
  ): Promise<Department | null> {
    const cacheKey = `${this.DEPT_CACHE_PREFIX}:${deptId}`;
    const cached = await this.cacheService.get<Department>(cacheKey);
    if (cached) return cached;

    const department = await this.departmentRepo.findOne({
      where: { id: deptId },
      select: { id: true, name: true, code: true, isActive: true },
    });

    if (department) {
      await this.cacheService.set(cacheKey, department, 3600); // 1 giờ
    }
    return department;
  }

  /**
   * Lấy User Department ID có hỗ trợ Caching (loại bỏ N+1 truy vấn bảng users/profiles)
   */
  private async getCachedUserDepartmentId(
    user: ExtendedUser,
  ): Promise<string | null> {
    if (user.departmentId && user.departmentId !== 'GLOBAL') {
      return user.departmentId;
    }

    const cacheKey = `${this.USER_DEPT_CACHE_PREFIX}:${user.id}`;
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const deptId = await getUserDepartmentId(this.requestRepo.manager, user);
    if (deptId) {
      await this.cacheService.set(cacheKey, deptId, 900); // 15 phút
    }
    return deptId ?? null;
  }

  /**
   * Invalidate cache của yêu cầu tuyển dụng
   */
  private async invalidateRequisitionCache(id: string): Promise<void> {
    try {
      await this.cacheService.del(`${this.CACHE_PREFIX}:${id}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to invalidate cache for requisition ${id}: ${errorMessage}`,
      );
    }
  }

  private assertValidTransition(
    current: RecruitmentRequestStatus,
    target: RecruitmentRequestStatus,
  ): void {
    const allowed: Record<
      RecruitmentRequestStatus,
      RecruitmentRequestStatus[]
    > = {
      [RecruitmentRequestStatus.PENDING_HR]: [
        RecruitmentRequestStatus.DRAFTED,
        RecruitmentRequestStatus.REJECTED,
        RecruitmentRequestStatus.CANCELLED,
      ],
      [RecruitmentRequestStatus.DRAFTED]: [
        RecruitmentRequestStatus.PENDING_HEAD_APPROVAL,
        RecruitmentRequestStatus.REJECTED,
        RecruitmentRequestStatus.CANCELLED,
      ],
      [RecruitmentRequestStatus.PENDING_HEAD_APPROVAL]: [
        RecruitmentRequestStatus.APPROVED,
        RecruitmentRequestStatus.REJECTED,
      ],
      [RecruitmentRequestStatus.APPROVED]: [
        RecruitmentRequestStatus.COMPLETED,
        RecruitmentRequestStatus.CANCELLED,
      ],
      [RecruitmentRequestStatus.REJECTED]: [
        RecruitmentRequestStatus.PENDING_HR,
      ],
      [RecruitmentRequestStatus.COMPLETED]: [],
      [RecruitmentRequestStatus.CANCELLED]: [],
    };

    if (!allowed[current]?.includes(target)) {
      throw new ConflictException(
        `Chuyển đổi trạng thái không hợp lệ từ ${current} sang ${target}.`,
      );
    }
  }

  private async assertViewPermission(
    requisition: RecruitmentRequest,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_requisition', 'read', 'any')) {
      return;
    }

    // const userDeptId = await getUserDepartmentId(
    //   this.requestRepo.manager,
    //   user,
    // );
    const userDeptId = await this.getCachedUserDepartmentId(user);

    const canReadDept = hasPermission(user, 'ats_requisition', 'read', 'dept');

    const isOwnDept =
      canReadDept &&
      Boolean(userDeptId && userDeptId === requisition.departmentId);
    const isRequester = user.id === requisition.requesterId;

    if (!isOwnDept && !isRequester) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào yêu cầu tuyển dụng này.',
      );
    }
  }

  private generateRequestCode(): string {
    const year = new Date().getFullYear();
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `REQ-${year}-${suffix}`;
  }
}
