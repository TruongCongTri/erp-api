import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AutomationJobPublishedEvent,
  AutomationJobCheckpointBlockedEvent,
  AutomationJobFailedEvent,
} from './publishing-automation.events';
import { Notification } from 'src/notifications/entities/notification.entity';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { User } from 'src/users/entities/users.entity';
import {
  NotificationCategory,
  NotificationPriority,
  ActorType,
  DeliveryChannel,
} from 'src/notifications/enums/notification.enum';

const ADMIN_AND_HR_ROLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DIR_HR_ADMIN',
  'DEP_DIR_HR_ADMIN',
  'STAFF_HR',
];
const FALLBACK_ORG_ID = '00000000-0000-0000-0000-000000000000';
const FALLBACK_DEPT_ID = 'GLOBAL';

@Injectable()
export class PublishingAutomationNotificationsListener {
  private readonly logger = new Logger(
    PublishingAutomationNotificationsListener.name,
  );

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ========================================================
  // JOB ĐĂNG THÀNH CÔNG -> BÁO CHO NGƯỜI LÊN LỊCH
  // ========================================================
  @OnEvent('automation_job.published', { async: true })
  async handlePublished(event: AutomationJobPublishedEvent): Promise<void> {
    this.logger.log(
      `[Event: Automation Published] Job ${event.jobId} trên ${event.platform}`,
    );

    const recipients = await this.resolveRecipients(event.recipientId);
    if (recipients.length === 0) return;

    const notifications = recipients.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId: user.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ANNOUNCEMENT,
        taskType: 'AUTOMATION_JOB_PUBLISHED',
        priority: NotificationPriority.NORMAL,
        actorType: ActorType.WORKFLOW_ENGINE,
        title: `Đăng tin tự động thành công [${event.platform}]`,
        body: event.publishedPostUrl
          ? `Tin tuyển dụng đã được đăng thành công lên ${event.targetDestination}. Link bài đăng: ${event.publishedPostUrl}`
          : `Tin tuyển dụng đã được đăng thành công lên ${event.targetDestination}.`,
        targetEntityType: 'ScheduledAutomationJob',
        targetEntityId: event.jobId,
        actionUrl: `/publishing-automation/jobs/${event.jobId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif));
  }

  // ========================================================
  // TÀI KHOẢN BỊ CHECKPOINT -> BÁO KHẨN CHO NGƯỜI LÊN LỊCH + HR/ADMIN
  // ========================================================
  @OnEvent('automation_job.checkpoint_blocked', { async: true })
  async handleCheckpointBlocked(
    event: AutomationJobCheckpointBlockedEvent,
  ): Promise<void> {
    this.logger.warn(
      `[Event: Automation Checkpoint Blocked] Tài khoản ${event.accountName} (job ${event.jobId})`,
    );

    const recipients = await this.resolveRecipients(event.recipientId, {
      alsoBroadcastToHr: true,
    });
    if (recipients.length === 0) return;

    const notifications = recipients.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId: user.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ALERT,
        taskType: 'AUTOMATION_ACCOUNT_CHECKPOINT_BLOCKED',
        priority: NotificationPriority.URGENT,
        actorType: ActorType.SYSTEM_CRON,
        title: `⚠️ Tài khoản Facebook bị khóa checkpoint: ${event.accountName}`,
        body: `Tài khoản "${event.accountName}" bị Facebook yêu cầu xác minh checkpoint/captcha khi đăng vào ${event.targetDestination}. Vui lòng đăng nhập thủ công để xác minh lại, cập nhật cookie mới cho tài khoản.`,
        targetEntityType: 'FacebookAccount',
        targetEntityId: event.accountId,
        actionUrl: `/publishing-automation/accounts/${event.accountId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif));
  }

  // ========================================================
  // JOB ĐĂNG THẤT BẠI -> BÁO CHO NGƯỜI LÊN LỊCH
  // ========================================================
  @OnEvent('automation_job.failed', { async: true })
  async handleFailed(event: AutomationJobFailedEvent): Promise<void> {
    this.logger.error(
      `[Event: Automation Failed] Job ${event.jobId}: ${event.errorMessage}`,
    );

    const recipients = await this.resolveRecipients(event.recipientId);
    if (recipients.length === 0) return;

    const notifications = recipients.map((user) =>
      this.notificationRepo.create({
        recipientId: user.id,
        organizationId: user.organizationId ?? FALLBACK_ORG_ID,
        departmentId: user.departmentId ?? FALLBACK_DEPT_ID,
        category: NotificationCategory.ALERT,
        taskType: 'AUTOMATION_JOB_FAILED',
        priority: NotificationPriority.HIGH,
        actorType: ActorType.SYSTEM_CRON,
        title: `Đăng tin tự động thất bại [${event.platform}]`,
        body: `Không thể đăng tin lên ${event.targetDestination} (lần thử ${event.retryCount}). Lỗi: ${event.errorMessage}`,
        targetEntityType: 'ScheduledAutomationJob',
        targetEntityId: event.jobId,
        actionUrl: `/publishing-automation/jobs/${event.jobId}`,
        deliveryChannels: [DeliveryChannel.IN_APP],
      }),
    );

    const saved = await this.notificationRepo.save(notifications);
    saved.forEach((notif) => this.pushToGateway(notif));
  }

  private async resolveRecipients(
    recipientId: string | null,
    options?: { alsoBroadcastToHr?: boolean },
  ): Promise<User[]> {
    const recipients: User[] = [];

    if (recipientId) {
      const user = await this.userRepo.findOneBy({ id: recipientId });
      if (user) recipients.push(user);
    }

    if (options?.alsoBroadcastToHr || recipients.length === 0) {
      const hrUsers = await this.userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.role', 'role')
        .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
        .getMany();

      for (const hrUser of hrUsers) {
        if (!recipients.some((r) => r.id === hrUser.id)) {
          recipients.push(hrUser);
        }
      }
    }

    return recipients;
  }

  private pushToGateway(notif: Notification): void {
    this.gateway.pushToUser(notif.recipientId, {
      id: notif.id,
      title: notif.title,
      message: notif.body,
      actionUrl: notif.actionUrl,
      createdAt: notif.createdAt,
      isRead: notif.isRead,
    });
  }
}
