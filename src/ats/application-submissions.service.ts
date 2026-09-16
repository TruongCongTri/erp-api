import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ApplicationSubmission } from './entities/application-submission.entity';
import { ApplicationPhase, PlatformSource } from './enums/ats.enum';
import { JobApplication } from './entities/job-application.entity';

export interface CreateSubmissionPayload {
  platformSource: PlatformSource;
  cvUrl: string;
  cvFileKey?: string | null;
  externalApplicationId?: string | null;
  coverLetter?: string | null;
}

@Injectable()
export class ApplicationSubmissionsService {
  private readonly logger = new Logger(ApplicationSubmissionsService.name);
  constructor(
    @InjectRepository(ApplicationSubmission)
    private readonly submissionRepo: Repository<ApplicationSubmission>,
    @InjectRepository(JobApplication)
    private readonly applicationRepo: Repository<JobApplication>,
  ) {}

  async createSubmission(
    applicationId: string,
    payload: CreateSubmissionPayload,
  ): Promise<ApplicationSubmission> {
    const submission = this.submissionRepo.create({
      applicationId,
      platformSource: payload.platformSource,
      cvUrl: payload.cvUrl,
      cvFileKey: payload.cvFileKey ?? null,
      externalApplicationId: payload.externalApplicationId ?? null,
      coverLetter: payload.coverLetter ?? null,
    });

    return this.submissionRepo.save(submission);
  }

  /**
   * Gọi ngoài transaction (sử dụng repository mặc định)
   */
  async findOrCreateApplication(
    candidateId: string,
    jobPostId: string,
    internalHrNotes?: string,
  ): Promise<{ application: JobApplication; isNew: boolean }> {
    return this.findOrCreateApplicationWithManager(
      this.applicationRepo.manager,
      candidateId,
      jobPostId,
      internalHrNotes,
    );
  }

  /**
   * Gọi trong transaction TypeORM thông qua EntityManager
   */
  async findOrCreateApplicationWithManager(
    manager: EntityManager,
    candidateId: string,
    jobPostId: string,
    internalHrNotes?: string,
  ): Promise<{ application: JobApplication; isNew: boolean }> {
    const repo = manager.getRepository(JobApplication);

    // 1. Kiểm tra xem ứng viên đã có hồ sơ cho vị trí này chưa (1 Candidate x 1 Job)
    let application = await repo.findOne({
      where: {
        candidate: { id: candidateId },
        jobPost: { id: jobPostId },
      },
    });

    if (application) {
      // Nếu đã có hồ sơ và lần này có ghi chú mới từ HR thì cập nhật bổ sung
      if (
        internalHrNotes?.trim() &&
        application.internalHrNotes !== internalHrNotes.trim()
      ) {
        application.internalHrNotes = application.internalHrNotes
          ? `${application.internalHrNotes}\n[${new Date().toLocaleDateString('vi-VN')}]: ${internalHrNotes.trim()}`
          : internalHrNotes.trim();

        application = await repo.save(application);
      }

      return {
        application,
        isNew: false,
      };
    }

    // 2. Tạo mới lượt ứng tuyển với trạng thái ban đầu (APPLIED / NEW)
    const newApplication = repo.create({
      candidate: { id: candidateId },
      jobPost: { id: jobPostId },
      status: ApplicationPhase.APPLIED,
      internalHrNotes: internalHrNotes?.trim() ?? null,
      // appliedAt: new Date(),
    });

    const savedApplication = await repo.save(newApplication);

    this.logger.log(
      `[JobApplication Created] Khởi tạo hồ sơ ứng tuyển mới: ${savedApplication.id} (Candidate: ${candidateId} -> Job: ${jobPostId})`,
    );

    return {
      application: savedApplication,
      isNew: true,
    };
  }
}
