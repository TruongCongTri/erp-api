import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { CandidateSubmissionsService } from './candidate-submissions.service';

import { CandidateSubmissionsController } from './candidate-submissions.controller';
import { CandidatesModule } from './candidates.module';
import { CacheModule } from 'src/common/cache/cache.module';
import { S3StorageService } from './s3-storage.service';

@Module({
  imports: [
    CandidatesModule, // Cung cấp CandidatesService, JobApplicationsService, ApplicationSubmissionsService và TypeOrmModule (JobPost, CandidateProfile, ...)
    CacheModule, // Cung cấp CacheService cho Debounce Lock và Active Job Cache
    BullModule.registerQueue({
      name: 'cv-upload-queue',
    }),
  ],
  controllers: [CandidateSubmissionsController],
  providers: [CandidateSubmissionsService, S3StorageService],
  exports: [CandidateSubmissionsService],
})
export class CandidateSubmissionsModule {}
