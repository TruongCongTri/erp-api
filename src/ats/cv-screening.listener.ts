import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CandidateCvSubmittedEvent } from './candidate-application.events';
import { ScreeningJobPayload } from './cv-screening.types';
import { ATS_CV_SCREENING_QUEUE } from './ats.constants';

@Injectable()
export class CvScreeningListener {
  private readonly logger = new Logger(CvScreeningListener.name);

  constructor(
    @InjectQueue(ATS_CV_SCREENING_QUEUE)
    private readonly screeningQueue: Queue<ScreeningJobPayload>,
  ) {}

  @OnEvent('ats.cv_submitted', { async: true })
  async handleCvSubmitted(event: CandidateCvSubmittedEvent): Promise<void> {
    this.logger.log(
      `[Queue Enqueue] Nhận CV mới từ Application: ${event.applicationId}. Đang đưa vào hàng đợi AI Screening...`,
    );

    // Dùng jobId theo application & submission để loại trừ enqueue trùng lặp
    const uniqueJobId = `screen-${event.applicationId}-${event.submissionId || 'latest'}`;

    await this.screeningQueue.add(
      'process-cv',
      {
        applicationId: event.applicationId,
        submissionId: event.submissionId,
        candidateId: event.candidateId,
        jobPostId: event.jobPostId,
        cvFileKey: event.cvFileKey,
        cvUrl: event.cvUrl,
      },
      {
        jobId: uniqueJobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
