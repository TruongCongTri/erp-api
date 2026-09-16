import { RecruitmentRequestStatus } from './enums/ats.enum';

export class RecruitmentRequestCreatedEvent {
  constructor(
    public readonly requestId: string,
    public readonly requestCode: string,
    public readonly requesterId: string,
    public readonly requesterName: string,
    public readonly departmentId: string,
    public readonly rawRequestNote: string,
  ) {}
}

export class RecruitmentRequestReviewedEvent {
  constructor(
    public readonly requestId: string,
    public readonly requestCode: string,
    public readonly reviewerId: string,
    public readonly reviewerName: string,
    public readonly status:
      RecruitmentRequestStatus.APPROVED | RecruitmentRequestStatus.REJECTED,
    public readonly rejectionReason?: string | null,
  ) {}
}

export class RecruitmentRequestStatusChangedEvent {
  constructor(
    public readonly requestId: string,
    public readonly requestCode: string,
    public readonly oldStatus: RecruitmentRequestStatus,
    public readonly newStatus: RecruitmentRequestStatus,
    public readonly updatedById: string,
    public readonly reason?: string,
  ) {}
}
