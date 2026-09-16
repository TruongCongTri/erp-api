import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm';

// import { CandidateProfile } from './entities/candidate-profile.entity';
// import { JobApplication } from './entities/job-application.entity';
// import { ApplicationSubmission } from './entities/application-submission.entity';
// import { JobPost } from './entities/job-post.entity';

// import { CandidatesService } from './candidates.service';
// import { ApplicationSubmissionsService } from './application-submissions.service';
// import { JobApplicationsService } from './job-applications.service';
import { CandidateSubmissionsService } from './candidate-submissions.service';

import { CandidateSubmissionsController } from './candidate-submissions.controller';
// import { JobApplicationsController } from './job-applications.controller';
import { BullModule } from '@nestjs/bullmq';
import { CandidatesModule } from './candidates.module';

@Module({
  imports: [
    // TypeOrmModule.forFeature([
    //   CandidateProfile,
    //   JobApplication,
    //   ApplicationSubmission,
    //   JobPost,
    // ]),
    CandidatesModule,
    BullModule.registerQueue({
      name: 'cv-upload-queue',
    }),
  ],
  controllers: [
    CandidateSubmissionsController,
    // JobApplicationsController
  ],
  providers: [
    // CandidatesService,
    // ApplicationSubmissionsService,
    // JobApplicationsService,
    CandidateSubmissionsService,
  ],
  exports: [
    // CandidatesService,
    // JobApplicationsService,
    // ApplicationSubmissionsService,
    CandidateSubmissionsService,
  ],
})
export class CandidateSubmissionsModule {}
