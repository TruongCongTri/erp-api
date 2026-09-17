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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateProfile,
      JobApplication,
      ApplicationSubmission,
      JobPost,
    ]),
    BullModule.registerQueue({
      name: ATS_CV_SCREENING_QUEUE,
    }),
  ],
  controllers: [CandidatesController, JobApplicationsController],
  providers: [
    CandidatesService,
    JobApplicationsService,
    ApplicationSubmissionsService,
  ],
  exports: [
    CandidatesService,
    JobApplicationsService,
    ApplicationSubmissionsService,
    TypeOrmModule,
  ],
})
export class CandidatesModule {}
