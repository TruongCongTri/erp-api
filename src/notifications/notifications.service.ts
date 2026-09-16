import {
  Injectable,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { User } from 'src/users/entities/users.entity';
import {
  NotificationCursorQueryDto,
  SortDirection,
} from './dto/notification-cursor-query.dto';
import {
  ActionState,
  ActorType,
  DeliveryChannel,
  NotificationCategory,
  NotificationPriority,
} from './enums/notification.enum';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { CacheService } from 'src/common/cache/cache.service';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  TicketAssignedEvent,
  TicketCreatedEvent,
  TicketMeetingScheduledEvent,
  TicketResolvedEvent,
  TicketSlaBreachedEvent,
  TicketStatusChangedEvent,
} from 'src/tickets/ticket.events';
import { AuthenticatedUser } from 'src/common/interfaces/authenticated-user.interface';
// import { Cron, CronExpression } from '@nestjs/schedule';

const ADMIN_AND_HR_ROLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DIR_HR_ADMIN',
  'DEP_DIR_HR_ADMIN',
  'STAFF_HR',
];
const FALLBACK_ORG_ID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_DEPT_ID = 'GLOBAL';
export type UserWithOrg = User & {
  organizationId?: string | null;
  departmentId?: string | null;
};

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
    readonly cacheService: CacheService,
  ) {}

  // =====================================
  // ENUMS ENDPOINT (CACHED Ở TẦNG SERVICE)
  // =====================================

  @Cacheable({
    key: 'notifications:enums:all',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400, // 24 giờ
  })
  // eslint-disable-next-line prettier/prettier
  getNotificationEnums(_bypassCache?: boolean) {
    return Promise.resolve({
      categories: Object.values(NotificationCategory),
      priorities: Object.values(NotificationPriority),
      actorTypes: Object.values(ActorType),
      actionStates: Object.values(ActionState),
      deliveryChannels: Object.values(DeliveryChannel),
    });
  }

  // =====================================
  // REST API METHODS (For the Bell Icon & Notifications Page)
  // =====================================

  async getMyNotifications(userId: string) {
    return this.notificationRepo.find({
      where: { recipientId: userId, isArchived: false },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  async getNotificationsPage(
    userId: string,
    query: NotificationCursorQueryDto,
  ) {
    const limit = Number(query.limit) || 20;
    const sortDirection =
      query.sortDirection === SortDirection.ASC ? 'ASC' : 'DESC';

    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.recipientId = :userId', { userId })
      .andWhere('notification.isArchived = false');

    if (query.search) {
      qb.andWhere(
        '(LOWER(notification.title) LIKE LOWER(:search) OR LOWER(notification.body) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    if (query.startDate) {
      qb.andWhere('notification.createdAt >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      qb.andWhere('notification.createdAt <= :endDate', {
        endDate: query.endDate,
      });
    }

    if (query.cursor) {
      if (sortDirection === 'DESC') {
        qb.andWhere('notification.createdAt < :cursor', {
          cursor: query.cursor,
        });
      } else {
        qb.andWhere('notification.createdAt > :cursor', {
          cursor: query.cursor,
        });
      }
    }

    qb.orderBy('notification.createdAt', sortDirection);
    qb.addOrderBy('notification.id', sortDirection);
    qb.take(limit + 1);

    const results = await qb.getMany();

    let nextCursor: string | null = null;
    if (results.length > limit) {
      results.pop();
      const lastItem = results[results.length - 1];
      nextCursor = lastItem.createdAt.toISOString();
    }

    return {
      data: results,
      nextCursor,
    };
  }

  // =====================================
  // PAGE-BASED PAGINATION (DATATABLE)
  // =====================================
  async findAll(userId: string, query: NotificationQueryDto) {
    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      fromDate,
      toDate,
      isRead,
      isArchived,
      includeExpired,
      departmentId,
      category,
      taskType,
      priority,
      isActionable,
      actionState,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.recipientId = :userId', { userId });

    // 1. Lọc theo trạng thái Lưu trữ (Archived)
    if (isArchived !== undefined) {
      qb.andWhere('notification.isArchived = :isArchived', { isArchived });
    } else {
      qb.andWhere('notification.isArchived = false'); // Mặc định ẩn tin đã lưu trữ
    }

    // 2. Lọc theo trạng thái Đã đọc / Chưa đọc
    if (isRead !== undefined) {
      qb.andWhere('notification.isRead = :isRead', { isRead });
    }

    // 3. Lọc thông báo hết hạn (Expired)
    // Nếu includeExpired là false (mặc định), chỉ lấy những tin chưa hết hạn hoặc không set ngày hết hạn
    if (!includeExpired) {
      qb.andWhere(
        '(notification.expiresAt IS NULL OR notification.expiresAt > NOW())',
      );
    }

    // 4. Lọc theo mảng (Taxonomy & Multi-Dept Slicing)
    if (departmentId && departmentId.length > 0) {
      qb.andWhere('notification.departmentId IN (:...departmentId)', {
        departmentId,
      });
    }
    if (category && category.length > 0) {
      qb.andWhere('notification.category IN (:...category)', { category });
    }
    if (taskType && taskType.length > 0) {
      qb.andWhere('notification.taskType IN (:...taskType)', { taskType });
    }
    if (priority && priority.length > 0) {
      qb.andWhere('notification.priority IN (:...priority)', { priority });
    }

    // 5. Lọc theo tương tác (Interactive Actions)
    if (isActionable !== undefined) {
      qb.andWhere('notification.isActionable = :isActionable', {
        isActionable,
      });
    }
    if (actionState) {
      qb.andWhere('notification.actionState = :actionState', { actionState });
    }

    // 6. Áp dụng bộ lọc tìm kiếm text
    if (search) {
      qb.andWhere(
        '(LOWER(notification.title) LIKE LOWER(:search) OR LOWER(notification.body) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // 7. Áp dụng bộ lọc thời gian
    if (fromDate) {
      qb.andWhere('notification.createdAt >= :fromDate', { fromDate });
    }
    if (toDate) {
      qb.andWhere('notification.createdAt <= :toDate', { toDate });
    }

    // 8. Xử lý sắp xếp (Sorting)
    const sortColumn = sortBy
      ? `notification.${sortBy}`
      : 'notification.createdAt';
    qb.orderBy(sortColumn, sortOrder);

    // Thêm tie-breaker bằng ID để đảm bảo thứ tự luôn ổn định khi trùng thời gian
    qb.addOrderBy('notification.id', sortOrder);

    // 9. Áp dụng phân trang (Offset/Limit)
    qb.skip(skip).take(limit);

    // 10. Thực thi query lấy dữ liệu và tổng số bản ghi
    const [data, total] = await qb.getManyAndCount();

    // 11. Tính toán Metadata
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.notificationRepo.update(
      { id: notificationId, recipientId: userId },
      { isRead: true, readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepo.update(
      { recipientId: userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  // =====================================
  // HELPER MAPPING FUNCTION FOR GATEWAY
  // =====================================
  private pushToGateway(userId: string, notif: Notification) {
    this.gateway.pushToUser(userId, {
      id: notif.id,
      title: notif.title,
      message: notif.body, // Map 'body' back to 'message' for FE compatibility
      actionUrl: notif.actionUrl,
      createdAt: notif.createdAt,
      isRead: notif.isRead,
    });
  }

  // =====================================
  // EVENT LISTENERS
  // =====================================

  @OnEvent('user.registered')
  async handleUserRegistered(payload: {
    userId: string;
    email: string;
    fullName: string;
  }) {
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      const userNode = hrUser as UserWithOrg;
      return this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: userNode.organizationId ?? FALLBACK_ORG_ID,
        departmentId: userNode.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.SYSTEM,
        taskType: 'USER_REGISTRATION',
        priority: NotificationPriority.NORMAL,
        actorType: ActorType.USER,
        actorId: payload.userId,
        actorSnapshot: { name: payload.fullName },
        title: 'New User Registration',
        body: `${payload.fullName} (${payload.email}) has registered and is pending verification.`,
        targetEntityType: 'User',
        targetEntityId: payload.userId,
        actionUrl: `/admin/users/${payload.userId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      });
    });

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // EVENT 1: WORKER SUBMITS A CLAIM -> NOTIFY HR
  // =====================================
  @OnEvent('profile.claim.submitted')
  async handleProfileClaimSubmitted(payload: {
    requesterId: string;
    requesterName: string;
    employeeCode: string;
  }) {
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      const userNode = hrUser as UserWithOrg;
      return this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: userNode.organizationId ?? FALLBACK_ORG_ID,
        departmentId: userNode.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.APPROVAL,
        taskType: 'PROFILE_CLAIM',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.USER,
        actorId: payload.requesterId,
        actorSnapshot: { name: payload.requesterName },
        title: 'Yêu cầu liên kết hồ sơ mới',
        body: `${payload.requesterName} đang yêu cầu liên kết với mã nhân viên ${payload.employeeCode}.`,
        targetEntityType: 'ProfileClaim',
        targetEntityId: payload.requesterId,
        actionUrl: `/admin/users-access?tab=pending`,
      });
    });

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => {
      this.pushToGateway(notif.recipientId, notif);
      this.gateway.emitSystemEventToUser(
        notif.recipientId,
        'invalidate_pending_claims',
      );
    });
  }

  // =====================================
  // EVENT 2: HR APPROVES CLAIM -> NOTIFY WORKER
  // =====================================
  @OnEvent('profile.claim.approved')
  async handleProfileClaimApproved(payload: {
    targetUserId: string;
    employeeCode: string;
  }) {
    const user = (await this.userRepo.findOneBy({
      id: payload.targetUserId,
    })) as UserWithOrg;

    const notif = this.notificationRepo.create({
      recipientId: payload.targetUserId,
      organizationId: user?.organizationId ?? FALLBACK_ORG_ID,
      departmentId: user?.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.SYSTEM,
      taskType: 'CLAIM_APPROVED',
      priority: NotificationPriority.NORMAL,
      actorType: ActorType.SYSTEM_CRON,
      title: 'Hồ sơ đã được phê duyệt',
      body: `Yêu cầu liên kết mã nhân viên ${payload.employeeCode} của bạn đã được phê duyệt. Vui lòng tải lại trang để cập nhật quyền.`,
      targetEntityType: 'User',
      targetEntityId: payload.targetUserId,
      actionUrl: `/profile`,
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);
  }

  // =====================================
  // EVENT 3: HR REJECTS CLAIM -> NOTIFY WORKER
  // =====================================
  @OnEvent('profile.claim.rejected')
  async handleProfileClaimRejected(payload: {
    targetUserId: string;
    employeeCode: string;
  }) {
    const user = (await this.userRepo.findOneBy({
      id: payload.targetUserId,
    })) as UserWithOrg;
    const notif = this.notificationRepo.create({
      recipientId: payload.targetUserId,
      organizationId: user?.organizationId ?? FALLBACK_ORG_ID,
      departmentId: user?.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.ALERT,
      taskType: 'CLAIM_REJECTED',
      priority: NotificationPriority.HIGH,
      actorType: ActorType.SYSTEM_CRON,
      title: 'Yêu cầu bị từ chối',
      body: `Yêu cầu liên kết mã nhân viên ${payload.employeeCode} của bạn đã bị từ chối. Vui lòng liên hệ bộ phận nhân sự.`,
      targetEntityType: 'User',
      targetEntityId: payload.targetUserId,
      actionUrl: `/contact-hr`,
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);
  }

  // =====================================
  // ATS EVENT 1: NEW RECRUITMENT REQUEST
  // =====================================
  @OnEvent('recruitment.request.created')
  async handleNewRecruitmentRequest(payload: {
    requestId: string;
    jobTitle: string;
    department: string;
    requesterName: string;
  }) {
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      const userNode = hrUser as UserWithOrg;
      return this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: userNode.organizationId ?? FALLBACK_ORG_ID,
        departmentId: userNode.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.TASK,
        taskType: 'NEW_RECRUITMENT_REQUEST',
        priority: NotificationPriority.NORMAL,
        actorType: ActorType.USER,
        actorSnapshot: { name: payload.requesterName },
        title: 'Yêu cầu tuyển dụng mới',
        body: `${payload.requesterName} vừa gửi yêu cầu tuyển dụng mới cho vị trí ${payload.jobTitle} (${payload.department}).`,
        targetEntityType: 'RecruitmentRequest',
        targetEntityId: payload.requestId,
        actionUrl: `/ats/requests/${payload.requestId}`,
      });
    });

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // ATS EVENT 2: AI JD DRAFT READY
  // =====================================
  @OnEvent('recruitment.draft.completed')
  async handleJdDraftCompleted(payload: {
    hrUserId: string;
    requestId: string;
    jobTitle: string;
    generatedData: Record<string, unknown>;
  }) {
    const hrUser = (await this.userRepo.findOneBy({
      id: payload.hrUserId,
    })) as UserWithOrg;

    const notif = this.notificationRepo.create({
      recipientId: payload.hrUserId,
      organizationId: hrUser?.organizationId ?? FALLBACK_ORG_ID,
      departmentId: hrUser?.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.SYSTEM,
      taskType: 'AI_JD_GENERATION',
      priority: NotificationPriority.NORMAL,
      actorType: ActorType.WORKFLOW_ENGINE,
      title: 'AI đã soạn xong JD',
      body: `Bản nháp JD cho vị trí ${payload.jobTitle} đã sẵn sàng để bạn kiểm tra.`,
      targetEntityType: 'RecruitmentRequest',
      targetEntityId: payload.requestId,
      actionUrl: `/ats/requests/${payload.requestId}`,
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);

    this.gateway.emitSystemEventToUser(payload.hrUserId, 'jd_draft_ready', {
      requestId: payload.requestId,
      data: payload.generatedData,
    });
  }

  // Handle Event Lỗi AI
  @OnEvent('recruitment.draft.failed')
  handleJdDraftFailed(payload: { hrUserId: string; requestId: string }) {
    this.gateway.emitSystemEventToUser(payload.hrUserId, 'jd_draft_failed', {
      requestId: payload.requestId,
      message: 'Quá trình tạo JD bằng AI gặp sự cố. Vui lòng thử lại.',
    });
  }

  // =====================================
  // ATS EVENT 3: DEPT HEAD APPROVED JD
  // =====================================
  @OnEvent('recruitment.request.approved')
  async handleJdApproved(payload: {
    requestId: string;
    jobTitle: string;
    approverName: string;
  }) {
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      const userNode = hrUser as UserWithOrg;
      return this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: userNode.organizationId ?? FALLBACK_ORG_ID,
        departmentId: userNode.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ANNOUNCEMENT,
        taskType: 'JD_APPROVED',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.USER,
        actorSnapshot: { name: payload.approverName },
        title: 'JD đã được duyệt',
        body: `${payload.approverName} đã duyệt JD cho vị trí ${payload.jobTitle}. Bạn có thể publish ngay lúc này.`,
        targetEntityType: 'RecruitmentRequest',
        targetEntityId: payload.requestId,
        actionUrl: `/ats/requests/${payload.requestId}`,
      });
    });

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // ATS EVENT 4: HIGH-SCORING CV RECEIVED
  // =====================================
  @OnEvent('application.scoring_completed')
  async handleHighScoringApplication(payload: {
    applicationId: string;
    score: number;
    jobTitle: string;
    candidateName: string;
  }) {
    if (payload.score < 80) return;

    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      const userNode = hrUser as UserWithOrg;
      return this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: userNode.organizationId ?? FALLBACK_ORG_ID,
        departmentId: userNode.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ALERT,
        taskType: 'CANDIDATE_SCORING',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.WORKFLOW_ENGINE,
        title: 'Ứng viên tiềm năng cao! 🌟',
        body: `AI vừa đánh giá ứng viên ${payload.candidateName} đạt ${payload.score}/100 điểm cho vị trí ${payload.jobTitle}.`,
        targetEntityType: 'JobApplication',
        targetEntityId: payload.applicationId,
        actionUrl: `/ats/applications/${payload.applicationId}`,
      });
    });

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // MOCK DATA GENERATOR (TESTING PURPOSES)
  // =====================================
  async seedMockDataForAdmin(currentUserId: string) {
    // 1. Tìm tài khoản SUPER_ADMIN (Ưu tiên người đang gọi API, nếu không thì lấy đại 1 SUPER_ADMIN)
    let superAdmin = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.id = :id AND role.slug = :role', {
        id: currentUserId,
        role: 'SUPER_ADMIN',
      })
      .getOne();

    if (!superAdmin) {
      superAdmin = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.role', 'role')
        .where('role.slug = :role', { role: 'SUPER_ADMIN' })
        .getOne();
    }

    if (!superAdmin) {
      throw new Error(
        'Không tìm thấy tài khoản SUPER_ADMIN nào trong hệ thống để tạo Mock Data.',
      );
    }

    const adminNode = superAdmin as UserWithOrg;
    const orgId = adminNode.organizationId ?? FALLBACK_ORG_ID;
    const deptId = adminNode.departmentId ?? FALLBACK_DEPT_ID;

    const mockNotifications: Notification[] = [];
    const now = new Date();

    // 2. Thêm 2 thông báo CỐ ĐỊNH theo yêu cầu (Gần đây nhất)
    mockNotifications.push(
      this.notificationRepo.create({
        recipientId: superAdmin.id,
        organizationId: orgId,
        departmentId: deptId,
        category: NotificationCategory.SYSTEM,
        taskType: 'SECURITY_UPDATE',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.SYSTEM_CRON,
        title: 'Bảo mật tài khoản',
        body: 'Hệ thống vừa cập nhật chính sách bảo mật mật khẩu. Vui lòng đổi mật khẩu định kỳ 90 ngày/lần để đảm bảo an toàn cho tài khoản của bạn.',
        targetEntityType: 'System',
        targetEntityId: 'SEC_001',
        actionUrl: '/profile/security',
        createdAt: new Date(now.getTime() - 1000 * 60 * 5), // 5 phút trước
        isRead: false,
      }),
      this.notificationRepo.create({
        recipientId: superAdmin.id,
        organizationId: orgId,
        departmentId: deptId,
        category: NotificationCategory.ANNOUNCEMENT,
        taskType: 'MAINTENANCE',
        priority: NotificationPriority.URGENT,
        actorType: ActorType.SYSTEM_CRON,
        title: 'Bảo trì hệ thống định kỳ',
        body: 'Hệ thống sẽ tạm ngưng hoạt động để bảo trì từ 22:00 đến 23:00 ngày Chủ Nhật tuần này. Vui lòng lưu lại các công việc đang làm dở.',
        targetEntityType: 'System',
        targetEntityId: 'MAINT_001',
        actionUrl: '/admin/dashboard',
        createdAt: new Date(now.getTime() - 1000 * 60 * 30), // 30 phút trước
        isRead: false,
      }),
    );

    // 3. Sinh ngẫu nhiên 48 thông báo còn lại (Lùi dần về quá khứ để test Cursor Pagination)
    const templates = [
      {
        title: 'Yêu cầu tuyển dụng cần duyệt',
        body: 'Trưởng phòng IT vừa gửi yêu cầu tuyển dụng 2 Backend Developer.',
        cat: NotificationCategory.TASK,
        prio: NotificationPriority.HIGH,
        url: '/ats/requests',
      },
      {
        title: 'Ứng viên nộp CV mới',
        body: 'Nguyễn Văn A vừa ứng tuyển vào vị trí Frontend ReactJS.',
        cat: NotificationCategory.ALERT,
        prio: NotificationPriority.NORMAL,
        url: '/ats/applications',
      },
      {
        title: 'Phê duyệt hồ sơ nhân sự',
        body: 'Nhân viên mới Lê Thị B đã cập nhật CCCD. Vui lòng kiểm tra.',
        cat: NotificationCategory.APPROVAL,
        prio: NotificationPriority.NORMAL,
        url: '/admin/users-access',
      },
      {
        title: 'Báo cáo tuần đã sẵn sàng',
        body: 'Báo cáo hiệu suất tuyển dụng tuần 36 đã được tổng hợp xong.',
        cat: NotificationCategory.SYSTEM,
        prio: NotificationPriority.LOW,
        url: '/reports',
      },
    ];

    for (let i = 2; i < 50; i++) {
      const template = templates[i % templates.length];

      mockNotifications.push(
        this.notificationRepo.create({
          recipientId: superAdmin.id,
          organizationId: orgId,
          departmentId: deptId,
          category: template.cat,
          taskType: 'MOCK_TASK',
          priority: template.prio,
          actorType: ActorType.USER,
          actorSnapshot: { name: `Người dùng ${i}` },
          title: `${template.title} #${i}`,
          body: template.body,
          targetEntityType: 'MockEntity',
          targetEntityId: `MOCK_${i}`,
          actionUrl: template.url,
          // Lùi thời gian: mỗi thông báo cách nhau 2 giờ
          createdAt: new Date(now.getTime() - i * 1000 * 60 * 60 * 2),
          // Random trạng thái đọc
          isRead: i % 3 === 0,
          readAt:
            i % 3 === 0 ? new Date(now.getTime() - i * 1000 * 60 * 60) : null,
        }),
      );
    }

    // 4. Lưu toàn bộ xuống DB
    await this.notificationRepo.save(mockNotifications);
  }

  // =====================================
  // HELPER MAPPING FUNCTION FOR GATEWAY
  // =====================================
  private mapPriority(priority: string): NotificationPriority {
    switch (priority) {
      case 'BLOCKER':
      case 'URGENT':
        return NotificationPriority.URGENT;
      case 'HIGH':
        return NotificationPriority.HIGH;
      case 'LOW':
        return NotificationPriority.LOW;
      case 'NORMAL':
      default:
        return NotificationPriority.NORMAL;
    }
  }

  // =====================================
  // TICKET EVENT 1: TICKET CREATED
  // =====================================
  @OnEvent('ticket.created')
  async handleTicketCreated(payload: TicketCreatedEvent) {
    const recipients: UserWithOrg[] = [];

    if (payload.assigneeId) {
      const assignedUser = await this.userRepo.findOneBy({
        id: payload.assigneeId,
      });
      if (assignedUser) recipients.push(assignedUser);
    } else {
      // 2. Chuyển vào Department Queue: Báo cho Trưởng phòng hoặc thành viên phòng ban tiếp nhận
      const deptMembers = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.role', 'role')
        .where('user.departmentId = :deptId', {
          deptId: payload.targetDepartmentId,
        })
        .getMany();

      // Ưu tiên Trưởng phòng, nếu không có thì gửi toàn bộ thành viên trong phòng ban tiếp nhận
      const deptHeads = deptMembers.filter(
        (u) =>
          u.role?.slug?.includes('HEAD') ||
          u.role?.slug?.includes('LEAD') ||
          u.role?.slug?.includes('ADMIN'),
      );

      recipients.push(...(deptHeads.length > 0 ? deptHeads : deptMembers));
    }

    if (recipients.length === 0) return;

    const notifPriority = this.mapPriority(payload.priority);

    const notifications = recipients.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId:
          user.departmentId ?? payload.targetDepartmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.TASK,
        taskType: 'TICKET_TRIAGE',
        priority: notifPriority,
        actorType: ActorType.USER,
        actorId: payload.requesterId,
        title: `Yêu cầu phối hợp mới [${payload.ticketCode}]`,
        body: payload.title,
        targetEntityType: 'Ticket',
        targetEntityId: payload.ticketId,
        actionUrl: `/tickets/${payload.ticketId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // TICKET EVENT 2: TICKET ASSIGNED
  // =====================================
  @OnEvent('ticket.assigned')
  async handleTicketAssigned(payload: TicketAssignedEvent) {
    const assignee = await this.userRepo.findOneBy({
      id: payload.assigneeId,
    });

    if (!assignee) return;

    const notif = this.notificationRepo.create({
      recipientId: assignee.id,
      organizationId: assignee.organizationId ?? FALLBACK_ORG_ID,
      departmentId: assignee.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.TASK,
      taskType: 'TICKET_ASSIGNED',
      priority: NotificationPriority.HIGH,
      actorType: ActorType.USER,
      actorId: payload.assignedById,
      title: `Phân công Ticket [${payload.ticketCode}]`,
      body: payload.internalNote
        ? `Bạn được phân công xử lý ticket ${payload.ticketCode}. Ghi chú: ${payload.internalNote}`
        : `Bạn đã được phân công xử lý ticket ${payload.ticketCode}.`,
      targetEntityType: 'Ticket',
      targetEntityId: payload.ticketId,
      actionUrl: `/tickets/${payload.ticketId}`,
      deliveryChannels: [DeliveryChannel.IN_APP],
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);
  }

  // =====================================
  // TICKET EVENT 3: MEETING SCHEDULED
  // =====================================
  @OnEvent('ticket.meeting_scheduled')
  async handleTicketMeetingScheduled(payload: TicketMeetingScheduledEvent) {
    if (!payload.attendeeIds || payload.attendeeIds.length === 0) return;

    const attendees = (await this.userRepo
      .createQueryBuilder('user')
      .where('user.id IN (:...attendeeIds)', {
        attendeeIds: payload.attendeeIds,
      })
      .getMany()) as UserWithOrg[];

    const formattedTime = new Date(payload.scheduledStart).toLocaleTimeString(
      'vi-VN',
      { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' },
    );

    const notifications = attendees.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId: user.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ANNOUNCEMENT,
        taskType: 'TICKET_MEETING',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.USER,
        title: `Lịch họp giải quyết Ticket [${payload.ticketCode}]`,
        body: `Nội dung: ${payload.agenda} vào lúc ${formattedTime}.`,
        targetEntityType: 'Ticket',
        targetEntityId: payload.ticketId,
        actionUrl: `/tickets/${payload.ticketId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }

  // =====================================
  // TICKET EVENT 4: TICKET RESOLVED
  // =====================================
  @OnEvent('ticket.resolved')
  async handleTicketResolved(payload: TicketResolvedEvent) {
    const requester = await this.userRepo.findOneBy({
      id: payload.requesterId,
    });

    if (!requester) return;

    const notif = this.notificationRepo.create({
      recipientId: requester.id,
      organizationId: requester.organizationId ?? FALLBACK_ORG_ID,
      departmentId: requester.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.APPROVAL,
      taskType: 'TICKET_RESOLVED',
      priority: NotificationPriority.NORMAL,
      actorType: ActorType.USER,
      actorId: payload.resolvedById,
      title: `Ticket [${payload.ticketCode}] đã xử lý xong`,
      body: `Kết quả: ${payload.resolutionNote}. Vui lòng nghiệm thu và đóng ticket.`,
      targetEntityType: 'Ticket',
      targetEntityId: payload.ticketId,
      actionUrl: `/tickets/${payload.ticketId}`,
      deliveryChannels: [DeliveryChannel.IN_APP],
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);
  }

  // =====================================
  // TICKET EVENT 5: STATUS CHANGED (REJECTED / REOPENED)
  // =====================================
  @OnEvent('ticket.status_changed')
  async handleTicketStatusChanged(payload: TicketStatusChangedEvent) {
    let targetUserId = payload.requesterId;
    let title = `Cập nhật trạng thái Ticket [${payload.ticketCode}]`;
    let body = `Trạng thái ticket đã chuyển sang ${payload.newStatus}.`;

    if (payload.newStatus === 'REJECTED') {
      title = `Ticket [${payload.ticketCode}] bị từ chối`;
      body = `Lý do từ chối: ${payload.reason ?? 'Không hợp lệ'}.`;
    } else if (payload.newStatus === 'REOPENED') {
      // Khi mở lại ticket -> báo cho người được phân công (nếu có)
      if (payload.assigneeId) targetUserId = payload.assigneeId;
      title = `Ticket [${payload.ticketCode}] được mở lại`;
      body = `Yêu cầu xử lý lại với lý do: ${payload.reason ?? 'Chưa đạt yêu cầu'}.`;
    }

    const targetUser = await this.userRepo.findOneBy({
      id: targetUserId,
    });

    if (!targetUser) return;

    const notif = this.notificationRepo.create({
      recipientId: targetUser.id,
      organizationId: targetUser.organizationId ?? FALLBACK_ORG_ID,
      departmentId: targetUser.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.ALERT,
      taskType: 'TICKET_STATUS_CHANGED',
      priority: NotificationPriority.HIGH,
      actorType: ActorType.USER,
      actorId: payload.updatedById,
      title,
      body,
      targetEntityType: 'Ticket',
      targetEntityId: payload.ticketId,
      actionUrl: `/tickets/${payload.ticketId}`,
      deliveryChannels: [DeliveryChannel.IN_APP],
    });

    const saved = await this.notificationRepo.save(notif);
    this.pushToGateway(saved.recipientId, saved);
  }

  // =====================================
  // TICKET EVENT 6: SLA BREACHED
  // =====================================
  @OnEvent('ticket.sla_breached')
  async handleTicketSlaBreached(payload: TicketSlaBreachedEvent) {
    // Báo động khẩn cấp cho Quản trị viên và Trưởng bộ phận phụ trách
    const alertUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .orWhere('user.departmentId = :deptId', {
        deptId: payload.targetDepartmentId,
      })
      .getMany();

    if (alertUsers.length === 0) return;

    const notifications = alertUsers.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId: user.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ALERT,
        taskType: 'SLA_BREACH_ALERT',
        priority: NotificationPriority.URGENT,
        actorType: ActorType.SYSTEM_CRON,
        title: `⚠️ Cảnh báo vi phạm SLA: Ticket [${payload.ticketCode}]`,
        body: `Phiếu yêu cầu thuộc phòng ban ${payload.targetDepartmentId} đã quá hạn giải quyết cam kết SLA!`,
        targetEntityType: 'Ticket',
        targetEntityId: payload.ticketId,
        actionUrl: `/tickets/${payload.ticketId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif.recipientId, notif));
  }
}
