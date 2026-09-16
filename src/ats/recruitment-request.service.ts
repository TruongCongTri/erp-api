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

export interface RoleObject {
  id?: string;
  name?: string;
  code?: string;
  slug?: string;
}

// interface RawDepartmentQueryResult {
//   departmentId?: string;
//   id?: string;
// }

@Injectable()
export class RecruitmentRequestService {
  private readonly logger = new Logger(RecruitmentRequestService.name);

  constructor(
    @InjectRepository(RecruitmentRequest)
    private readonly requestRepo: Repository<RecruitmentRequest>,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
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
      const userDeptId = await getUserDepartmentId(
        this.requestRepo.manager,
        user,
      );
      if (userDeptId && userDeptId !== 'GLOBAL') {
        targetDeptId = userDeptId;
      }
    }

    if (!targetDeptId || targetDeptId === 'GLOBAL') {
      throw new BadRequestException(
        'Vui lòng chọn phòng ban tiếp nhận yêu cầu tuyển dụng.',
      );
    }

    const department = await this.departmentRepo.findOneBy({
      id: targetDeptId,
    });
    if (!department) {
      throw new BadRequestException('Phòng ban được chọn không tồn tại.');
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
    const userDeptId = await getUserDepartmentId(
      this.requestRepo.manager,
      user,
    );

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
  // 2. QUERY & DATA SCOPE ENFORCEMENT
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
    const qb = this.requestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.requester', 'requester')
      .leftJoinAndSelect('req.department', 'department')
      .leftJoinAndSelect('req.jobPost', 'jobPost');

    // ── Phân Quyền Hiển Thị Danh Sách (RBAC Scope) ──
    const canReadAny = hasPermission(user, 'ats_requisition', 'read', 'any');
    const canReadDept = hasPermission(user, 'ats_requisition', 'read', 'dept');

    if (!canReadAny) {
      const userDeptId = await getUserDepartmentId(
        this.requestRepo.manager,
        user,
      );

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
    if (search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(req.requestCode) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(req.rawRequestNote) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(requester.fullName) LIKE LOWER(:search)', {
              search: `%${search}%`,
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

    // ── Phân Trang ──
    qb.orderBy(`req.${sortBy}`, sortOrder);
    qb.addOrderBy('req.id', sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  async findOne(id: string, user: ExtendedUser): Promise<RecruitmentRequest> {
    const requisition = await this.requestRepo.findOne({
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

    await this.assertViewPermission(requisition, user);
    return requisition;
  }

  // ==========================================
  // 3. EDIT RAW PROMPT (PRE-DRAFT STAGES)
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

    return this.requestRepo.save(requisition);
  }

  // ==========================================
  // 4. REVIEW WORKFLOW (DEPT HEAD FINAL SIGN-OFF)
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
    const userDeptId = await getUserDepartmentId(
      this.requestRepo.manager,
      user,
    );
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
  // 5. CANCEL REQUISITION
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
    const userDeptId = await getUserDepartmentId(
      this.requestRepo.manager,
      user,
    );
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
  // 6. INTERNAL TRANSITION & UTILS
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

    return this.requestRepo.save(requisition);
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

    const userDeptId = await getUserDepartmentId(
      this.requestRepo.manager,
      user,
    );

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
