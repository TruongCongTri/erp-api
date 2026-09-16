import { AiScreeningTier } from './enums/ats.enum';

// 1. Sự kiện hoàn tất sàng lọc AI cho một lần nộp hồ sơ (Submission)
export class CandidateScreeningCompletedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly aiScore: number,
    public readonly aiTier: AiScreeningTier,
    public readonly aiReasoning: string,
    public readonly submissionId?: string | null,
    public readonly isCvPurged: boolean = false,
  ) {}
}

// 2. Ứng viên đạt chuẩn sơ tuyển (Tier HIGH ≥ 80 điểm)
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

// 3. Ứng viên bị loại tự động (Tier LOW < 50 điểm, CV đã dọn dẹp khỏi S3)
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

// 4. Khôi phục ứng viên từ Talent Pool
export class CandidatePromotedFromPoolEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly promotedById: string,
    public readonly note?: string,
  ) {}
}
