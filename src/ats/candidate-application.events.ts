import { PlatformSource, ApplicationPhase } from './enums/ats.enum';

export class CandidateCvSubmittedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly submissionId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly cvUrl: string,
    public readonly cvFileKey: string | undefined,
    public readonly platformSource: PlatformSource,
    public readonly isReapplication: boolean,
  ) {}
}

export class ApplicationPhaseChangedEvent {
  constructor(
    public readonly applicationId: string,
    public readonly candidateId: string,
    public readonly jobPostId: string,
    public readonly oldPhase: ApplicationPhase,
    public readonly newPhase: ApplicationPhase,
    public readonly updatedById: string,
    public readonly internalNotes?: string | null,
  ) {}
}
