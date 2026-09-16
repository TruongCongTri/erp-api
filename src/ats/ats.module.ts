// src/ats/ats.module.ts
import { Module } from '@nestjs/common';
import { RecruitmentRequestModule } from './recruitment-request.module';
import { JobPostsModule } from './job-posts.module';
import { CandidateSubmissionsModule } from './candidate-submissions.module';
import { CvScreeningModule } from './cv-screening.module';
import { AtsEventsModule } from './ats-events.module';
import { CandidatesModule } from './candidates.module';

@Module({
  imports: [
    RecruitmentRequestModule,
    JobPostsModule,
    CandidatesModule,
    CandidateSubmissionsModule,
    CvScreeningModule,
    AtsEventsModule,
  ],
  exports: [
    RecruitmentRequestModule,
    JobPostsModule,
    CandidatesModule,
    CandidateSubmissionsModule,
    CvScreeningModule,
    AtsEventsModule,
  ],
})
export class AtsModule {}
