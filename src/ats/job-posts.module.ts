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
import { CacheModule } from 'src/common/cache/cache.module';
import { Department } from 'src/departments/entities/department.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      JobPost,
      RecruitmentRequest,
      JobApplication,
      Department,
    ]),
    CacheModule, // Cung cấp CacheService cho Template Caching và Detail Hot-Read
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
  exports: [
    JobPostsService,
    AtsAiService,
    JobPublishingService,
    TypeOrmModule, // Cho phép các module con khác trong ats.module truy cập Repository
  ],
})
export class JobPostsModule {}
