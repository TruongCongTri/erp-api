import { ApplicationPhase, AiScreeningTier } from './enums/ats.enum';

export class ApplicationPhaseChangedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string | null | undefined,
    public readonly oldPhase: ApplicationPhase,
    public readonly newPhase: ApplicationPhase,
    public readonly updatedById: string,
    public readonly internalNotes?: string | null,
  ) {}
}

export class ApplicationPromotedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string | null | undefined,
    public readonly targetPhase: ApplicationPhase,
    public readonly promotedById: string,
    public readonly note?: string,
  ) {}
}

export class ApplicationScreeningCompletedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string | null | undefined,
    public readonly aiScore: number | null,
    public readonly aiTier: AiScreeningTier,
    public readonly submissionId?: string | null,
  ) {}
}
