import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';

import {
  RecruitmentRequestCreatedEvent,
  JobPostApprovalRequestedEvent,
  JobPostPublishedEvent,
  CandidateSubmissionIngestedEvent,
  CandidateShortlistedEvent,
  CandidateScreeningRejectedEvent,
  CandidatePooledEvent,
} from './ats-domain.events';
import { CV_RETENTION_DAYS } from './ats.constants';
import { Notification } from 'src/notifications/entities/notification.entity';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { User } from 'src/users/entities/users.entity';
import {
  NotificationCategory,
  NotificationPriority,
  ActorType,
  DeliveryChannel,
} from 'src/notifications/enums/notification.enum';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { SaveAuditLogDto } from 'src/audit-log/dto/save-audit-log.dto';
import {
  AuditActionType,
  AuditStatus,
  DiffChangeType,
  AuditClientApp,
  ActorRoleLevel,
} from 'src/audit-log/audit-log.types';
// import { ScreeningJobPayload } from './cv-screening.types';
// import { ATS_CV_SCREENING_QUEUE } from './ats.constants';

const ADMIN_AND_HR_ROLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DIR_HR_ADMIN',
  'DEP_DIR_HR_ADMIN',
  'STAFF_HR',
];
const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_ORG_ID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_DEPT_ID = 'GLOBAL';

@Injectable()
export class AtsDomainEventsListener {
  private readonly logger = new Logger(AtsDomainEventsListener.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
    private readonly auditLogService: AuditLogService,
    // @InjectQueue(ATS_CV_SCREENING_QUEUE)
    // private readonly screeningQueue: Queue<ScreeningJobPayload>,
  ) {}

  // ========================================================
  // 1. DEPT HEAD TẠO YÊU CẦU -> BÁO HÀNG ĐỢI DIR_HR_ADMIN
  // ========================================================
  @OnEvent('recruitment.request.created', { async: true })
  async handleRecruitmentRequestCreated(
    event: RecruitmentRequestCreatedEvent,
  ): Promise<void> {
    this.logger.log(
      `[Event: Requisition Created] Mã: ${event.requestCode} bởi ${event.requesterName}`,
    );

    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    if (hrUsers.length === 0) return;

    const notifications = hrUsers.map((hrUser) =>
      this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: hrUser.organizationId ?? FALLBACK_ORG_ID,
        departmentId: hrUser.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.TASK,
        taskType: 'NEW_RECRUITMENT_REQUEST',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.USER,
        actorId: event.requesterId,
        actorSnapshot: { name: event.requesterName },
        title: `Yêu cầu tuyển dụng mới [${event.requestCode}]`,
        body: `${event.requesterName} vừa gửi yêu cầu tuyển dụng mới. Vui lòng kiểm tra và phân công soạn thảo JD.`,
        targetEntityType: 'RecruitmentRequest',
        targetEntityId: event.requestId,
        actionUrl: `/ats/requests/${event.requestId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => {
      this.gateway.pushToUser(notif.recipientId, {
        id: notif.id,
        title: notif.title,
        message: notif.body,
        actionUrl: notif.actionUrl,
        createdAt: notif.createdAt,
        isRead: notif.isRead,
      });
    });
  }

  // ========================================================
  // 2. HR GỬI JD -> TẠO TASK DUYỆT ƯU TIÊN CHO DEPT HEAD
  // ========================================================
  @OnEvent('job_post.approval_requested', { async: true })
  async handleJobPostApprovalRequested(
    event: JobPostApprovalRequestedEvent,
  ): Promise<void> {
    this.logger.log(
      `[Event: JD Approval Requested] Job ${event.jobCode} gửi tới Trưởng bộ phận: ${event.departmentHeadId}`,
    );

    const headUser = await this.userRepo.findOneBy({
      id: event.departmentHeadId,
    });
    if (!headUser) return;

    const notif = this.notificationRepo.create({
      recipientId: headUser.id,
      organizationId: headUser.organizationId ?? FALLBACK_ORG_ID,
      departmentId: headUser.departmentId ?? FALLBACK_DEPT_ID,
      category: NotificationCategory.APPROVAL,
      taskType: 'JD_APPROVAL_REQUEST',
      priority: NotificationPriority.URGENT,
      actorType: ActorType.USER,
      actorId: event.requesterId,
      title: `Cần duyệt bản thảo JD: ${event.publicTitle}`,
      body: `Phòng Nhân sự đã hoàn tất bản thảo cho mã tin [${event.jobCode}]. Vui lòng xem xét và phản hồi duyệt.`,
      targetEntityType: 'JobPost',
      targetEntityId: event.jobPostId,
      actionUrl: `/ats/job-posts/${event.jobPostId}?tab=review`,
      deliveryChannels: [DeliveryChannel.IN_APP],
    });

    const saved = await this.notificationRepo.save(notif);
    this.gateway.pushToUser(saved.recipientId, {
      id: saved.id,
      title: saved.title,
      message: saved.body,
      actionUrl: saved.actionUrl,
      createdAt: saved.createdAt,
      isRead: saved.isRead,
    });
  }

  // ========================================================
  // 3. XUẤT BẢN TIN -> GHI AUDIT LOG & THÔNG BÁO DEPT HEAD
  // ========================================================
  @OnEvent('job_post.published', { async: true })
  async handleJobPostPublished(event: JobPostPublishedEvent): Promise<void> {
    this.logger.log(
      `[Event: Job Published] ${event.jobCode} trên các kênh: ${event.platforms.join(', ')}`,
    );

    // A. Ghi vết kiểm toán bất biến (Immutable Audit Trail)
    const publisher = await this.userRepo.findOneBy({
      id: event.publishedById,
    });
    const logDto = new SaveAuditLogDto();
    logDto.actorId = publisher?.id || SYSTEM_UUID;
    logDto.actorName = publisher?.fullName || 'Hệ thống tự động';
    logDto.actorInitials = (publisher?.fullName || 'SYS')
      .substring(0, 2)
      .toUpperCase();
    logDto.actorDepartmentId = publisher?.departmentId || 'HR_DEPT';
    logDto.actorRoleLevel = ActorRoleLevel.STAFF;
    logDto.clientApp = AuditClientApp.WEB_PORTAL;
    logDto.ipAddress = '127.0.0.1';
    logDto.userAgent = 'Internal-Worker';
    logDto.status = AuditStatus.SUCCESS;
    logDto.actionType = AuditActionType.APPROVE;
    logDto.actionLabel = 'Xuất bản tin tuyển dụng';
    logDto.resourceSlug = 'ats_job_post';
    logDto.resourceLabel = 'Bản tin tuyển dụng';
    logDto.targetEntityId = event.jobPostId;
    logDto.summary = `Tin tuyển dụng [${event.jobCode}] - "${event.publicTitle}" đã được xuất bản lên: ${event.platforms.join(', ')}`;
    logDto.diffPayload = {
      changeType: DiffChangeType.STATUS_TRANSITION,
      fields: [
        {
          field: 'externalMapping',
          label: 'Kênh phân phối ngoài',
          oldValue: null,
          newValue: JSON.stringify(event.externalMapping),
        },
      ],
    };

    void this.auditLogService.logAction(logDto);

    // B. Gửi thông báo hoàn tất cho Trưởng bộ phận phụ trách
    if (event.departmentHeadId) {
      const headUser = await this.userRepo.findOneBy({
        id: event.departmentHeadId,
      });
      if (headUser) {
        const notif = this.notificationRepo.create({
          recipientId: headUser.id,
          organizationId: headUser.organizationId ?? FALLBACK_ORG_ID,
          departmentId: headUser.departmentId ?? FALLBACK_DEPT_ID,
          category: NotificationCategory.ANNOUNCEMENT,
          taskType: 'JOB_PUBLISHED',
          priority: NotificationPriority.NORMAL,
          actorType: ActorType.USER,
          actorId: event.publishedById,
          title: `Tin tuyển dụng đã xuất bản: ${event.publicTitle}`,
          body: `Tin tuyển dụng của phòng ban bạn đã chính thức được đăng tuyển đa kênh.`,
          targetEntityType: 'JobPost',
          targetEntityId: event.jobPostId,
          actionUrl: `/ats/job-posts/${event.jobPostId}`,
          deliveryChannels: [DeliveryChannel.IN_APP],
        });

        const saved = await this.notificationRepo.save(notif);
        this.gateway.pushToUser(saved.recipientId, {
          id: saved.id,
          title: saved.title,
          message: saved.body,
          actionUrl: saved.actionUrl,
          createdAt: saved.createdAt,
          isRead: saved.isRead,
        });
      }
    }
  }

  // ========================================================
  // 4. TIẾP NHẬN CV MỌI KÊNH -> ĐẨY VÀO HÀNG ĐỢI BULLMQ SÀNG LỌC
  // ========================================================
  @OnEvent('ats.cv_submitted', { async: true })
  handleCandidateSubmissionIngested(
    event: CandidateSubmissionIngestedEvent,
  ): void {
    this.logger.log(
      `[Event: CV Ingested] Kênh: ${event.platformSource} -> Application: ${event.applicationId}. Enqueue BullMQ...`,
    );

    // await this.screeningQueue.add(
    //   'process-cv',
    //   {
    //     applicationId: event.applicationId,
    //     submissionId: event.submissionId,
    //     candidateId: event.candidateId,
    //     jobPostId: event.jobPostId,
    //     cvUrl: event.cvUrl,
    //   },
    //   {
    //     attempts: 3,
    //     backoff: { type: 'exponential', delay: 5000 },
    //     removeOnComplete: true,
    //   },
    // );
  }

  // ========================================================
  // 5. AI ĐẠT ≥ 80 ĐIỂM -> BÁO ĐỘNG ỨNG VIÊN TIỀM NĂNG CAO
  // ========================================================
  @OnEvent('ats.candidate_shortlisted', { async: true })
  async handleCandidateShortlisted(
    event: CandidateShortlistedEvent,
  ): Promise<void> {
    this.logger.log(
      `[Event: Candidate Shortlisted] ${event.candidateName} đạt ${event.aiScore}/100 điểm cho vị trí ${event.jobTitle}`,
    );

    // Gửi thông báo cho chuyên viên tuyển dụng phụ trách hoặc nhóm HR
    const recipients = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    if (recipients.length === 0) return;

    const notifications = recipients.map((hrUser) =>
      this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: hrUser.organizationId ?? FALLBACK_ORG_ID,
        departmentId: hrUser.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ALERT,
        taskType: 'CANDIDATE_SHORTLISTED',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.WORKFLOW_ENGINE,
        title: `Ứng viên tiềm năng cao! (${event.aiScore}/100 điểm) 🌟`,
        body: `AI đã chấm điểm ứng viên ${event.candidateName} đạt ${event.aiScore} điểm cho vị trí ${event.jobTitle}. Đề xuất chuyển ứng viên sang vòng tiếp theo (phỏng vấn).`,
        targetEntityType: 'JobApplication',
        targetEntityId: event.applicationId,
        actionUrl: `/ats/applications/${event.applicationId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => {
      this.gateway.pushToUser(notif.recipientId, {
        id: notif.id,
        title: notif.title,
        message: notif.body,
        actionUrl: notif.actionUrl,
        createdAt: notif.createdAt,
        isRead: notif.isRead,
      });
    });
  }

  // ========================================================
  // 6B. AI 50-79 ĐIỂM -> BÁO CHO HR: CV VẪN ĐƯỢC LƯU TRỮ TRONG KHO DỰ TRỮ
  // ========================================================
  @OnEvent('ats.candidate_pooled', { async: true })
  async handleCandidatePooled(event: CandidatePooledEvent): Promise<void> {
    this.logger.log(
      `[Event: Candidate Pooled] ${event.candidateName} đạt ${event.aiScore}/100 điểm cho vị trí ${event.jobTitle} -> SAVED_POOL`,
    );

    const recipients = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    if (recipients.length === 0) return;

    const notifications = recipients.map((hrUser) =>
      this.notificationRepo.create({
        recipientId: hrUser.id,
        organizationId: hrUser.organizationId ?? FALLBACK_ORG_ID,
        departmentId: hrUser.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.TASK,
        taskType: 'CANDIDATE_POOLED',
        priority: NotificationPriority.NORMAL,
        actorType: ActorType.WORKFLOW_ENGINE,
        title: `Ứng viên vào Kho dự trữ (${event.aiScore}/100 điểm)`,
        body: `AI đã chấm điểm ứng viên ${event.candidateName} đạt ${event.aiScore} điểm cho vị trí ${event.jobTitle} - mức trung bình. CV vẫn được lưu trữ trong hệ thống để xem xét sau.`,
        targetEntityType: 'JobApplication',
        targetEntityId: event.applicationId,
        actionUrl: `/ats/applications/${event.applicationId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => {
      this.gateway.pushToUser(notif.recipientId, {
        id: notif.id,
        title: notif.title,
        message: notif.body,
        actionUrl: notif.actionUrl,
        createdAt: notif.createdAt,
        isRead: notif.isRead,
      });
    });
  }

  // ========================================================
  // 6. AI < 50 ĐIỂM -> BÁO HR XEM XÉT TRONG 7 NGÀY + GHI KIỂM TOÁN
  // ========================================================
  @OnEvent('ats.candidate_rejected', { async: true })
  async handleCandidateScreeningRejected(
    event: CandidateScreeningRejectedEvent,
  ): Promise<void> {
    this.logger.log(
      `[Event: Candidate Auto-Rejected] ${event.candidateName} không đạt tiêu chuẩn sơ loại (${event.aiScore}/100 điểm)`,
    );

    const recipients = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    if (recipients.length > 0) {
      const purgeDateLabel = event.cvPurgeAt
        ? new Date(event.cvPurgeAt).toLocaleDateString('vi-VN')
        : `${CV_RETENTION_DAYS} ngày tới`;

      const notifications = recipients.map((hrUser) =>
        this.notificationRepo.create({
          recipientId: hrUser.id,
          organizationId: hrUser.organizationId ?? FALLBACK_ORG_ID,
          departmentId: hrUser.departmentId ?? FALLBACK_DEPT_ID,
          category: NotificationCategory.ALERT,
          taskType: 'CANDIDATE_SCREENING_REJECTED',
          priority: NotificationPriority.NORMAL,
          actorType: ActorType.WORKFLOW_ENGINE,
          title: `Ứng viên bị AI sơ loại (${event.aiScore}/100 điểm)`,
          body: `AI đã chấm điểm ứng viên ${event.candidateName} chỉ đạt ${event.aiScore} điểm cho vị trí ${event.jobTitle ?? 'vị trí tuyển dụng'}. Vui lòng xem xét hồ sơ và cập nhật trạng thái nếu muốn giữ lại; nếu không, CV sẽ tự động bị xóa khỏi hệ thống lưu trữ vào ${purgeDateLabel}.`,
          targetEntityType: 'JobApplication',
          targetEntityId: event.applicationId,
          actionUrl: `/ats/applications/${event.applicationId}`,
          deliveryChannels: [DeliveryChannel.IN_APP],
        }),
      );

      const saved = await this.notificationRepo.save(notifications);
      saved.forEach((notif) => {
        this.gateway.pushToUser(notif.recipientId, {
          id: notif.id,
          title: notif.title,
          message: notif.body,
          actionUrl: notif.actionUrl,
          createdAt: notif.createdAt,
          isRead: notif.isRead,
        });
      });
    }

    const logDto = new SaveAuditLogDto();
    logDto.actorId = SYSTEM_UUID;
    logDto.actorName = 'AI Screening Engine';
    logDto.actorInitials = 'AI';
    logDto.actorDepartmentId = 'HR_DEPT';
    logDto.actorRoleLevel = ActorRoleLevel.STAFF;
    logDto.clientApp = AuditClientApp.BACKGROUND_JOB;
    logDto.ipAddress = '127.0.0.1';
    logDto.userAgent = 'AI-Screening-Worker';
    logDto.status = AuditStatus.SUCCESS;
    logDto.actionType = AuditActionType.REJECT;
    logDto.actionLabel = 'Sơ loại ứng viên tự động';
    logDto.resourceSlug = 'ats_application';
    logDto.resourceLabel = 'Hồ sơ ứng tuyển';
    logDto.targetEntityId = event.applicationId;
    logDto.summary = `Hồ sơ ${event.candidateName} bị loại tự động sang SCREENING_REJECTED với điểm đánh giá ${event.aiScore}/100.`;
    logDto.diffPayload = {
      changeType: DiffChangeType.STATUS_TRANSITION,
      fields: [
        {
          field: 'aiReasoning',
          label: 'Phân tích đánh giá AI',
          oldValue: null,
          newValue: event.aiReasoning.substring(0, 300),
        },
      ],
    };

    void this.auditLogService.logAction(logDto);
  }
}
