import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { JobApplication } from './entities/job-application.entity';
import { JobPost } from './entities/job-post.entity';
import { ApplicationSubmission } from './entities/application-submission.entity';
import { CandidateProfile } from './entities/candidate-profile.entity';

import { JobApplicationsController } from './job-applications.controller';
import { JobApplicationsService } from './job-applications.service';
import { S3StorageService } from './s3-storage.service';
import { CacheModule } from 'src/common/cache/cache.module';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobApplication,
      JobPost,
      ApplicationSubmission,
      CandidateProfile,
    ]),
    CacheModule,
    BullModule.registerQueue({
      name: ATS_CV_SCREENING_QUEUE,
    }),
  ],
  controllers: [JobApplicationsController],
  providers: [JobApplicationsService, S3StorageService],
  exports: [JobApplicationsService, TypeOrmModule],
})
export class JobApplicationsModule {}
