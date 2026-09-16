import { PlatformSource } from './enums/ats.enum';

// 1. Dept Head tạo yêu cầu tuyển dụng mới
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

// 2. HR gửi bản thảo JD để Trưởng bộ phận phê duyệt
export class JobPostApprovalRequestedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly publicTitle: string,
    public readonly requesterId: string,
    public readonly departmentHeadId: string,
  ) {}
}

// 3. Tin tuyển dụng được xuất bản đa kênh
export class JobPostPublishedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly publicTitle: string,
    public readonly platforms: PlatformSource[],
    public readonly externalMapping: Record<string, string>,
    public readonly publishedById: string,
    public readonly departmentHeadId?: string | null,
  ) {}
}

// 4. Hồ sơ CV được nộp từ bất kỳ kênh nào (Bổ sung cvFileKey phục vụ S3 GetObject)
export class CandidateSubmissionIngestedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly submissionId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly cvUrl: string,
    public readonly platformSource: PlatformSource,
    public readonly isReapplication: boolean,
    public readonly cvFileKey?: string | null,
  ) {}
}

// 5. AI chấm điểm CV đạt chuẩn xuất sắc (≥ 80 điểm)
export class CandidateShortlistedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly candidateName: string,
    public readonly candidateEmail: string,
    public readonly jobTitle: string,
    public readonly aiScore: number,
    public readonly hrRecipientId?: string | null,
    public readonly submissionId?: string | null,
  ) {}
}

// 6. AI sơ loại tự động ứng viên không đạt tiêu chuẩn (< 50 điểm)
export class CandidateScreeningRejectedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly candidateName: string,
    public readonly aiScore: number,
    public readonly aiReasoning: string,
    public readonly submissionId?: string | null,
    public readonly isCvPurged: boolean = true,
  ) {}
}
