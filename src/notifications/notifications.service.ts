import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { User } from 'src/users/entities/users.entity';
// import { Cron, CronExpression } from '@nestjs/schedule';

const ADMIN_AND_HR_ROLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'DIR_HR_ADMIN',
  'DEP_DIR_HR_ADMIN',
  'STAFF_HR',
];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
  ) {}

  // =====================================
  // EVENT LISTENERS
  // =====================================

  // Tell ESLint to trust the official NestJS OnEvent decorator
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @OnEvent('user.registered')
  async handleUserRegistered(payload: {
    userId: string;
    email: string;
    fullName: string;
  }) {
    // 1. Find all users who are HR or Admins (Using a simplified role query for example)
    // In a full RBAC, you would query users joining the Permission table for 'hr:update:any'
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.slug IN (:...roles)', {
        roles: ADMIN_AND_HR_ROLES,
      })
      .getMany();

    // 2. Prepare the notifications
    const notifications = hrUsers.map((hrUser) => {
      return this.notificationRepo.create({
        user: hrUser,
        title: 'New User Registration',
        message: `${payload.fullName} (${payload.email}) has registered and is pending verification.`,
        actionUrl: `/admin/users/${payload.userId}`,
      });
    });

    // 3. Save all to database
    const saved = await this.notificationRepo.save(notifications);

    // 4. Push real-time via WebSockets to the bell icon
    for (const notif of saved) {
      this.gateway.pushToUser(notif.user.id, {
        id: notif.id,
        title: notif.title,
        message: notif.message,
        actionUrl: notif.actionUrl,
        createdAt: notif.createdAt,
      });
    }
  }

  // =====================================
  // REST API METHODS (For the Bell Icon)
  // =====================================

  async getMyNotifications(userId: string) {
    return this.notificationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 20, // Only load the last 20 for the dropdown
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.notificationRepo.update(
      { id: notificationId, user: { id: userId } },
      { isRead: true },
    );
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepo.update(
      { user: { id: userId }, isRead: false },
      { isRead: true },
    );
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
    // Find all users who are allowed to approve claims (HR/Admins)
    const hrUsers = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      // You can adjust these role slugs to match your actual HR/Admin roles
      .where('role.slug IN (:...roles)', { roles: ADMIN_AND_HR_ROLES })
      .getMany();

    const notifications = hrUsers.map((hrUser) => {
      return this.notificationRepo.create({
        user: hrUser,
        title: 'Yêu cầu liên kết hồ sơ mới',
        message: `${payload.requesterName} đang yêu cầu liên kết với mã nhân viên ${payload.employeeCode}.`,
        actionUrl: `/admin/users-access?tab=pending`, // 👈 Route HR to the pending tab
      });
    });

    const saved = await this.notificationRepo.save(notifications);

    for (const notif of saved) {
      this.gateway.pushToUser(notif.user.id, {
        id: notif.id,
        title: notif.title,
        message: notif.message,
        actionUrl: notif.actionUrl,
        createdAt: notif.createdAt,
      });

      this.gateway.emitSystemEventToUser(
        notif.user.id,
        'invalidate_pending_claims',
      );
    }
  }

  // =====================================
  // EVENT 2: HR APPROVES CLAIM -> NOTIFY WORKER
  // =====================================
  @OnEvent('profile.claim.approved')
  async handleProfileClaimApproved(payload: {
    targetUserId: string;
    employeeCode: string;
  }) {
    const notif = this.notificationRepo.create({
      user: { id: payload.targetUserId } as User,
      title: 'Hồ sơ đã được phê duyệt 🎉',
      message: `Yêu cầu liên kết mã nhân viên ${payload.employeeCode} của bạn đã được phê duyệt. Vui lòng tải lại trang để cập nhật quyền.`,
      actionUrl: `/profile`,
    });

    const saved = await this.notificationRepo.save(notif);

    this.gateway.pushToUser(payload.targetUserId, {
      id: saved.id,
      title: saved.title,
      message: saved.message,
      actionUrl: saved.actionUrl,
      createdAt: saved.createdAt,
    });
  }

  // =====================================
  // EVENT 3: HR REJECTS CLAIM -> NOTIFY WORKER
  // =====================================
  @OnEvent('profile.claim.rejected')
  async handleProfileClaimRejected(payload: {
    targetUserId: string;
    employeeCode: string;
  }) {
    const notif = this.notificationRepo.create({
      user: { id: payload.targetUserId } as User,
      title: 'Yêu cầu bị từ chối',
      message: `Yêu cầu liên kết mã nhân viên ${payload.employeeCode} của bạn đã bị từ chối. Vui lòng liên hệ bộ phận nhân sự.`,
      actionUrl: `/contact-hr`,
    });

    const saved = await this.notificationRepo.save(notif);

    this.gateway.pushToUser(payload.targetUserId, {
      id: saved.id,
      title: saved.title,
      message: saved.message,
      actionUrl: saved.actionUrl,
      createdAt: saved.createdAt,
    });
  }

  private readonly logger = new Logger(NotificationsService.name);

  // =====================================
  // MOCK DATA GENERATOR (Runs every 5 mins)
  // =====================================

  // @Cron(CronExpression.EVERY_5_MINUTES)
  // async sendMockNotifications() {
  //   this.logger.log('Running 5-minute mock notification blast...');

  //   // 1. Find all users in the HR or IT departments
  //   const targetUsers = await this.userRepo
  //     .createQueryBuilder('user')
  //     .leftJoinAndSelect('user.role', 'role')
  //     // Adjust these strings to match your EXACT role slugs in the database
  //     .where('role.slug IN (:...roles)', {
  //       roles: ADMIN_AND_HR_ROLES,
  //     })
  //     .getMany();

  //   if (targetUsers.length === 0) {
  //     this.logger.warn('No HR or IT users found for mock notification.');
  //     return;
  //   }

  //   // 2. Prepare the notifications
  //   const notifications = targetUsers.map((user) => {
  //     return this.notificationRepo.create({
  //       user: user,
  //       title: 'Kiểm tra hệ thống 🔄',
  //       message: `Đây là thông báo tự động mỗi 5 phút. Gửi lúc: ${new Date().toLocaleTimeString('vi-VN')}`,
  //       actionUrl: `/admin/dashboard`,
  //     });
  //   });

  //   // 3. Save to database so they persist in the UI dropdown
  //   const savedNotifs = await this.notificationRepo.save(notifications);

  //   // 4. Push in real-time via WebSockets so the Bell icon updates instantly!
  //   for (const notif of savedNotifs) {
  //     this.gateway.pushToUser(notif.user.id, {
  //       id: notif.id,
  //       title: notif.title,
  //       message: notif.message,
  //       actionUrl: notif.actionUrl,
  //       createdAt: notif.createdAt,
  //     });
  //   }

  //   this.logger.log(
  //     `Successfully sent mock notifications to ${targetUsers.length} users.`,
  //   );
  // }
}
