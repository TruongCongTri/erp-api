import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { JobPost } from './entities/job-post.entity';
import { JobPostStatus } from './enums/ats.enum';
import { JobPublishingService } from './job-publishing.service';
import { JobPostPublishedEvent } from './job-post.events';

@Processor('job-publishing')
export class JobPublishingConsumer extends WorkerHost {
  private readonly logger = new Logger(JobPublishingConsumer.name);

  constructor(
    @InjectRepository(JobPost)
    private readonly jobPostRepo: Repository<JobPost>,
    private readonly publishingService: JobPublishingService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(
    job: Job<{ jobPostId: string; publishedById: string }>,
  ): Promise<void> {
    const { jobPostId, publishedById } = job.data;
    this.logger.log(
      `[BullMQ] Bắt đầu kích hoạt lịch đăng tuyển cho Job: ${jobPostId}`,
    );

    const jobPost = await this.jobPostRepo.findOneBy({ id: jobPostId });
    if (!jobPost) {
      this.logger.warn(`Job ${jobPostId} không tồn tại để xuất bản.`);
      return;
    }

    if (
      jobPost.status === JobPostStatus.CLOSED ||
      jobPost.status === JobPostStatus.ARCHIVED
    ) {
      this.logger.warn(`Job ${jobPostId} đã bị đóng hoặc hủy bỏ.`);
      return;
    }

    const mapping = await this.publishingService.dispatchToPlatforms(jobPost);

    jobPost.status = JobPostStatus.PUBLISHED;
    jobPost.publishedAt = new Date();
    jobPost.externalMapping = { ...jobPost.externalMapping, ...mapping };
    jobPost.updatedBy = publishedById;

    await this.jobPostRepo.save(jobPost);

    this.eventEmitter.emit(
      'job_post.published',
      new JobPostPublishedEvent(
        jobPost.id,
        jobPost.jobCode,
        jobPost.publicTitle,
        jobPost.targetPlatforms,
        jobPost.externalMapping,
        publishedById,
      ),
    );

    this.logger.log(
      `[BullMQ] Đăng tuyển thành công cho Job Code: ${jobPost.jobCode}`,
    );
  }
}
