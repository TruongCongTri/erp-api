// src/ats/candidates.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Entities
import { CandidateProfile } from './entities/candidate-profile.entity';
import { JobApplication } from './entities/job-application.entity';
import { ApplicationSubmission } from './entities/application-submission.entity';
import { JobPost } from './entities/job-post.entity';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';

// Controllers
import { CandidatesController } from './candidates.controller';
import { JobApplicationsController } from './job-applications.controller';

// Services
import { CandidatesService } from './candidates.service';
import { JobApplicationsService } from './job-applications.service';
import { ApplicationSubmissionsService } from './application-submissions.service';
import { CacheModule } from 'src/common/cache/cache.module';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateProfile,
      JobApplication,
      ApplicationSubmission,
      JobPost,
    ]),
    CacheModule, // Cung cấp CacheService cho Dedup & Hot-Read Caching
    BullModule.registerQueue({
      name: ATS_CV_SCREENING_QUEUE,
    }),
  ],
  controllers: [CandidatesController, JobApplicationsController],
  providers: [
    CandidatesService,
    JobApplicationsService,
    ApplicationSubmissionsService,
    S3StorageService,
  ],
  exports: [
    CandidatesService,
    JobApplicationsService,
    ApplicationSubmissionsService,
    TypeOrmModule, // Cho phép các module con khác trong ats.module tái sử dụng Repository
  ],
})
export class CandidatesModule {}
