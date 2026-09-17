import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { ScheduledAutomationJob } from './entities/scheduled-automation-job.entity';
import { AutomationJobStatus } from './enums/publishing-automation.enum';
import { CreateSingleAutomationJobDto } from './dto/create-single-automation-job.dto';
import { PUBLISHING_AUTOMATION_QUEUE } from './publishing-automation.constants';

const RETRYABLE_STATUSES = [
  AutomationJobStatus.FAILED,
  AutomationJobStatus.CHECKPOINT_BLOCKED,
];

@Injectable()
export class AutomationJobsService {
  constructor(
    @InjectRepository(ScheduledAutomationJob)
    private readonly jobRepo: Repository<ScheduledAutomationJob>,
    @InjectQueue(PUBLISHING_AUTOMATION_QUEUE)
    private readonly publishingQueue: Queue,
  ) {}

  // Powers the job-post detail page: shows every channel/group already
  // scheduled or published for this ATS job posting, so the FE can grey out
  // what's done and only offer the remaining channels for later publishing.
  async findByAtsJobPostingId(
    atsJobPostingId: string,
  ): Promise<ScheduledAutomationJob[]> {
    return this.jobRepo.find({
      where: { atsJobPostingId },
      relations: { group: true },
      order: { scheduledAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ScheduledAutomationJob> {
    const job = await this.jobRepo.findOne({
      where: { id },
      relations: { group: true },
    });
    if (!job) {
      throw new NotFoundException('Không tìm thấy tác vụ đăng bài tự động');
    }
    return job;
  }

  // For TopCV/CareerViet, which have no group/cooldown concept: a single
  // destination, published immediately or at one future timestamp.
  async createSingleJob(
    dto: CreateSingleAutomationJobDto,
    user: ActiveUserData,
  ): Promise<ScheduledAutomationJob> {
    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : new Date();

    const job = this.jobRepo.create({
      atsJobPostingId: dto.atsJobId,
      platform: dto.platform,
      targetDestination: dto.targetDestination,
      groupId: null,
      jobTitle: dto.jobTitle,
      jobDescription: dto.jobDescription,
      scheduledAt,
      status: AutomationJobStatus.PENDING,
      createdBy: user.id,
      createdByName: user.fullName,
    });

    const saved = await this.jobRepo.save(job);

    await this.publishingQueue.add(
      'publish',
      { jobId: saved.id },
      {
        jobId: saved.id,
        delay: Math.max(0, saved.scheduledAt.getTime() - Date.now()),
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    return saved;
  }

  // Requeues a FAILED/CHECKPOINT_BLOCKED job immediately (e.g. after the HR
  // has fixed the account's cookies or reworded the post).
  async retry(
    id: string,
    user: ActiveUserData,
  ): Promise<ScheduledAutomationJob> {
    const job = await this.findOne(id);
    if (!RETRYABLE_STATUSES.includes(job.status)) {
      throw new BadRequestException(
        `Chỉ có thể thử lại các tác vụ ở trạng thái FAILED hoặc CHECKPOINT_BLOCKED (hiện tại: ${job.status})`,
      );
    }

    job.status = AutomationJobStatus.PENDING;
    job.scheduledAt = new Date();
    job.lastErrorMessage = null;
    job.screenshotErrorPath = null;
    job.updatedBy = user.id;
    job.updatedByName = user.fullName;

    const saved = await this.jobRepo.save(job);

    await this.publishingQueue.add(
      'publish',
      { jobId: saved.id },
      {
        jobId: `${saved.id}-retry-${Date.now()}`,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );

    return saved;
  }
}
