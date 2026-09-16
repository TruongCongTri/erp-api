// src/ats/ats-events.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { Notification } from 'src/notifications/entities/notification.entity';
import { User } from 'src/users/entities/users.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { AtsDomainEventsListener } from './ats-domain-events.listener';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    NotificationsModule,
    AuditLogModule,
    BullModule.registerQueue({
      name: ATS_CV_SCREENING_QUEUE,
    }),
  ],
  providers: [AtsDomainEventsListener],
  exports: [AtsDomainEventsListener],
})
export class AtsEventsModule {}
