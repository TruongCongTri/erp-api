export class JobPostApprovalRequestedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly publicTitle: string,
    public readonly requesterId: string,
    public readonly departmentHeadId: string,
  ) {}
}

export class JobPostReviewedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly reviewerId: string,
    public readonly isApproved: boolean,
    public readonly reviewNotes?: string,
  ) {}
}

export class JobPostPublishedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly publicTitle: string,
    public readonly platforms: string[],
    public readonly externalMapping: Record<string, string>,
    public readonly publishedById: string,
  ) {}
}

export class JobPostClosedEvent {
  constructor(
    public readonly jobPostId: string,
    public readonly jobCode: string,
    public readonly closedById: string,
    public readonly externalMapping: Record<string, string>,
  ) {}
}
