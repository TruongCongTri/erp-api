/**
 * Decoupled domain events for asynchronous notification dispatch and webhook triggers.
 *
 */
export class TicketCreatedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly title: string,
    public readonly requesterId: string,
    public readonly requesterDepartmentId: string,
    public readonly targetDepartmentId: string,
    public readonly priority: string,
    public readonly assigneeId?: string | null,
  ) {}
}

export class TicketAssignedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly assigneeId: string,
    public readonly assignedById: string,
    public readonly internalNote?: string,
  ) {}
}

export class TicketMeetingScheduledEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly meetingId: string,
    public readonly agenda: string,
    public readonly scheduledStart: Date,
    public readonly attendeeIds: string[],
  ) {}
}

export class TicketResolvedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly requesterId: string,
    public readonly resolvedById: string,
    public readonly resolutionNote: string,
  ) {}
}

export class TicketStatusChangedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly requesterId: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
    public readonly updatedById: string,
    public readonly reason?: string,
    public readonly assigneeId?: string | null,
  ) {}
}

export class TicketSlaBreachedEvent {
  constructor(
    public readonly ticketId: string,
    public readonly ticketCode: string,
    public readonly targetDepartmentId: string,
    public readonly priority: string,
    public readonly resolutionDueAt?: Date | null,
  ) {}
}
