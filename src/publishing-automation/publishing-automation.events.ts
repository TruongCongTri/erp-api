export class AutomationJobPublishedEvent {
  constructor(
    public readonly jobId: string,
    public readonly atsJobPostingId: string,
    public readonly platform: string,
    public readonly targetDestination: string,
    public readonly publishedPostUrl: string | null,
    public readonly recipientId: string | null,
  ) {}
}

export class AutomationJobCheckpointBlockedEvent {
  constructor(
    public readonly jobId: string,
    public readonly atsJobPostingId: string,
    public readonly platform: string,
    public readonly targetDestination: string,
    public readonly accountId: string,
    public readonly accountName: string,
    public readonly recipientId: string | null,
  ) {}
}

export class AutomationJobFailedEvent {
  constructor(
    public readonly jobId: string,
    public readonly atsJobPostingId: string,
    public readonly platform: string,
    public readonly targetDestination: string,
    public readonly errorMessage: string,
    public readonly retryCount: number,
    public readonly recipientId: string | null,
  ) {}
}
