import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { Notification } from 'src/notifications/entities/notification.entity';
import { User } from 'src/users/entities/users.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';

import { FacebookAccount } from './entities/facebook-account.entity';
import { ManagedFacebookGroup } from './entities/managed-facebook-group.entity';
import { ScheduledAutomationJob } from './entities/scheduled-automation-job.entity';

import { FacebookAccountsController } from './facebook-accounts.controller';
import { FacebookGroupManagementController } from './facebook-group-management.controller';
import { StaggeredScheduleController } from './staggered-schedule.controller';
import { AutomationJobsController } from './automation-jobs.controller';

import { FacebookAccountsService } from './facebook-accounts.service';
import { FacebookGroupService } from './facebook-group.service';
import { GroupSuitabilityService } from './group-suitability.service';
import { StaggeredScheduleService } from './staggered-schedule.service';
import { AutomationJobsService } from './automation-jobs.service';
import { BrowserManagerService } from './browser-manager.service';

import { FacebookGroupPublisherStrategy } from './strategies/facebook-group-publisher.strategy';
import { TopCvPublisherStrategy } from './strategies/topcv-publisher.strategy';
import { CareerVietPublisherStrategy } from './strategies/careerviet-publisher.strategy';
import { PublisherStrategyFactory } from './strategies/publisher-strategy.factory';

import { PublishingAutomationProcessor } from './publishing-automation.processor';
import { PublishingAutomationNotificationsListener } from './publishing-automation-notifications.listener';
import { PUBLISHING_AUTOMATION_QUEUE } from './publishing-automation.constants';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      FacebookAccount,
      ManagedFacebookGroup,
      ScheduledAutomationJob,
      Notification,
      User,
    ]),
    BullModule.registerQueue({
      name: PUBLISHING_AUTOMATION_QUEUE,
    }),
    NotificationsModule,
  ],
  controllers: [
    FacebookAccountsController,
    FacebookGroupManagementController,
    StaggeredScheduleController,
    AutomationJobsController,
  ],
  providers: [
    FacebookAccountsService,
    FacebookGroupService,
    GroupSuitabilityService,
    StaggeredScheduleService,
    AutomationJobsService,
    BrowserManagerService,
    FacebookGroupPublisherStrategy,
    TopCvPublisherStrategy,
    CareerVietPublisherStrategy,
    PublisherStrategyFactory,
    PublishingAutomationProcessor,
    PublishingAutomationNotificationsListener,
  ],
  exports: [FacebookAccountsService, FacebookGroupService],
})
export class PublishingAutomationModule {}
