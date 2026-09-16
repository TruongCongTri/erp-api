import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { JobPost } from './entities/job-post.entity';
import { RecruitmentRequest } from './entities/recruitment-request.entity';
import { JobApplication } from './entities/job-application.entity';

import { JobPostsController } from './job-posts.controller';
import { JobPostsService } from './job-posts.service';
import { AtsAiService } from './ats-ai.service';
import { JobPublishingService } from './job-publishing.service';
import { JobPublishingConsumer } from './job-publishing.consumer';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([JobPost, RecruitmentRequest, JobApplication]),
    BullModule.registerQueue({
      name: 'job-publishing',
    }),
  ],
  controllers: [JobPostsController],
  providers: [
    JobPostsService,
    AtsAiService,
    JobPublishingService,
    JobPublishingConsumer,
  ],
  exports: [JobPostsService, AtsAiService, JobPublishingService],
})
export class JobPostsModule {}
