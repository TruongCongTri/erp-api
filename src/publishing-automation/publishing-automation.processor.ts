import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { ScheduledAutomationJob } from './entities/scheduled-automation-job.entity';
import { ManagedFacebookGroup } from './entities/managed-facebook-group.entity';
import { FacebookAccount } from './entities/facebook-account.entity';
import {
  AutomationJobStatus,
  FacebookAccountStatus,
} from './enums/publishing-automation.enum';
import { PublisherStrategyFactory } from './strategies/publisher-strategy.factory';
import { PUBLISHING_AUTOMATION_QUEUE } from './publishing-automation.constants';
import {
  AutomationJobPublishedEvent,
  AutomationJobCheckpointBlockedEvent,
  AutomationJobFailedEvent,
} from './publishing-automation.events';

@Processor(PUBLISHING_AUTOMATION_QUEUE)
export class PublishingAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingAutomationProcessor.name);

  constructor(
    @InjectRepository(ScheduledAutomationJob)
    private readonly jobRepo: Repository<ScheduledAutomationJob>,
    @InjectRepository(ManagedFacebookGroup)
    private readonly groupRepo: Repository<ManagedFacebookGroup>,
    @InjectRepository(FacebookAccount)
    private readonly accountRepo: Repository<FacebookAccount>,
    private readonly strategyFactory: PublisherStrategyFactory,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    const automationJob = await this.jobRepo.findOne({
      where: { id: job.data.jobId },
    });
    if (!automationJob) {
      this.logger.warn(
        `ScheduledAutomationJob ${job.data.jobId} không tồn tại`,
      );
      return;
    }

    automationJob.status = AutomationJobStatus.PROCESSING;
    await this.jobRepo.save(automationJob);

    const group = automationJob.groupId
      ? await this.groupRepo.findOne({
          where: { id: automationJob.groupId },
          relations: { assignedAccount: true },
        })
      : null;
    const account = group?.assignedAccount ?? null;

    const strategy = this.strategyFactory.resolve(automationJob.platform);
    const result = await strategy.publish({
      job: automationJob,
      jobTitle: automationJob.jobTitle ?? '',
      jobDescription: automationJob.jobDescription ?? '',
      targetDestination: automationJob.targetDestination,
      group,
      account,
    });

    if (result.success) {
      automationJob.status = AutomationJobStatus.SUCCESS;
      automationJob.publishedPostUrl = result.publishedPostUrl ?? null;
      automationJob.lastErrorMessage = null;
      await this.jobRepo.save(automationJob);

      if (group) {
        group.lastPostedAt = new Date();
        await this.groupRepo.save(group);
      }

      this.logger.log(
        `[${automationJob.platform}] Đăng bài thành công cho job ${automationJob.id}`,
      );

      this.eventEmitter.emit(
        'automation_job.published',
        new AutomationJobPublishedEvent(
          automationJob.id,
          automationJob.atsJobPostingId,
          automationJob.platform,
          automationJob.targetDestination,
          automationJob.publishedPostUrl,
          automationJob.createdBy ?? null,
        ),
      );
      return;
    }

    if (result.checkpointBlocked) {
      automationJob.status = AutomationJobStatus.CHECKPOINT_BLOCKED;
      automationJob.screenshotErrorPath = result.screenshotPath ?? null;
      automationJob.lastErrorMessage = result.errorMessage ?? null;
      await this.jobRepo.save(automationJob);

      if (account) {
        account.status = FacebookAccountStatus.CHECKPOINT_BLOCKED;
        await this.accountRepo.save(account);
      }

      this.logger.error(
        `[${automationJob.platform}] Tài khoản bị chặn checkpoint cho job ${automationJob.id}`,
      );

      if (account) {
        this.eventEmitter.emit(
          'automation_job.checkpoint_blocked',
          new AutomationJobCheckpointBlockedEvent(
            automationJob.id,
            automationJob.atsJobPostingId,
            automationJob.platform,
            automationJob.targetDestination,
            account.id,
            account.accountName,
            automationJob.createdBy ?? null,
          ),
        );
      }
      return;
    }

    automationJob.retryCount += 1;
    automationJob.status = AutomationJobStatus.FAILED;
    automationJob.screenshotErrorPath = result.screenshotPath ?? null;
    automationJob.lastErrorMessage = result.errorMessage ?? null;
    await this.jobRepo.save(automationJob);

    this.logger.error(
      `[${automationJob.platform}] Đăng bài thất bại cho job ${automationJob.id}: ${result.errorMessage ?? 'unknown error'}`,
    );

    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      this.eventEmitter.emit(
        'automation_job.failed',
        new AutomationJobFailedEvent(
          automationJob.id,
          automationJob.atsJobPostingId,
          automationJob.platform,
          automationJob.targetDestination,
          result.errorMessage ?? 'Unknown error',
          automationJob.retryCount,
          automationJob.createdBy ?? null,
        ),
      );
    }

    throw new Error(result.errorMessage ?? 'Publishing failed');
  }
}
