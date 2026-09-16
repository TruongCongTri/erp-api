import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { JobPost } from './entities/job-post.entity';
import { JobApplication } from './entities/job-application.entity';
import { ApplicationSubmission } from './entities/application-submission.entity';

import { CvParserService } from './cv-parser.service';
import { AtsAiService } from './ats-ai.service';
import { JobApplicationsService } from './job-applications.service';
import { CvScreeningConsumer } from './cv-screening.consumer';
import { CvScreeningListener } from './cv-screening.listener';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';
import { CandidatesModule } from './candidates.module';
@Module({
  imports: [
    CandidatesModule,
    TypeOrmModule.forFeature([JobPost, JobApplication, ApplicationSubmission]),
    BullModule.registerQueue({
      name: ATS_CV_SCREENING_QUEUE,
    }),
  ],
  providers: [
    CvParserService,
    AtsAiService,
    JobApplicationsService,
    CvScreeningConsumer,
    CvScreeningListener,
  ],
  exports: [CvParserService, AtsAiService, BullModule],
})
export class CvScreeningModule {}
