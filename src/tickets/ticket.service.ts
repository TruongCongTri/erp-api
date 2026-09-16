import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository, DataSource, Brackets } from 'typeorm';
import { randomBytes } from 'crypto';
import { Ticket } from './entities/ticket.entity';
import { TicketMeeting } from './entities/ticket-meeting.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { RejectTicketDto } from './dto/reject-ticket.dto';
import { ScheduleTicketMeetingDto } from './dto/schedule-ticket-meeting.dto';
import { RecordMeetingOutcomesDto } from './dto/record-meeting-outcomes.dto';
import { TicketPriority, TicketStatus } from './ticket.types';
import {
  TicketAssignedEvent,
  TicketCreatedEvent,
  TicketMeetingScheduledEvent,
  TicketResolvedEvent,
  TicketStatusChangedEvent,
} from './ticket.events';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';

type ExtendedUser = ActiveUserData & {
  departmentId?: string;
  roleLevel?: string;
};

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketMeeting)
    private readonly meetingRepo: Repository<TicketMeeting>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // 1. TICKET CREATION & CODE / SLA RESOLUTION
  // ==========================================

  async create(dto: CreateTicketDto, user: ExtendedUser): Promise<Ticket> {
    const requesterDept = user.departmentId || 'GLOBAL';
    const status = dto.isDraft ? TicketStatus.DRAFT : TicketStatus.SUBMITTED;
    const ticketCode = this.generateUniqueTicketCode(dto.targetDepartmentId);

    const now = new Date();
    const { responseDueAt, resolutionDueAt } = this.calculateSlaDueDates(
      dto.priority || TicketPriority.NORMAL,
      now,
    );

    const ticket = this.ticketRepo.create({
      ...dto,
      ticketCode,
      status,
      requesterId: user.id,
      requesterDepartmentId: requesterDept,
      priority: dto.priority || TicketPriority.NORMAL,
      responseDueAt: dto.isDraft ? null : responseDueAt,
      resolutionDueAt: dto.isDraft ? null : resolutionDueAt,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const savedTicket = await this.ticketRepo.save(ticket);

    if (!dto.isDraft) {
      this.eventEmitter.emit(
        'ticket.created',
        new TicketCreatedEvent(
          savedTicket.id,
          savedTicket.ticketCode,
          savedTicket.title,
          savedTicket.requesterId,
          savedTicket.requesterDepartmentId,
          savedTicket.targetDepartmentId,
          savedTicket.priority,
          savedTicket.assigneeId,
        ),
      );
    }

    return savedTicket;
  }

  // ==========================================
  // 2. QUERYING & MULTI-DEPT TRIAGE QUEUE
  // ==========================================

  async findAll(query: QueryTicketDto, _user: ExtendedUser) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      category,
      priority,
      status,
      targetDepartmentId,
      requesterDepartmentId,
      requesterId,
      assigneeId,
      isUnassigned,
      targetProjectId,
      targetEntityType,
      targetEntityId,
      isSlaBreached,
      fromDate,
      toDate,
    } = query;

    const skip = (page - 1) * limit;
    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.meetings', 'meetings');

    // ── Free-Text Search ──
    if (search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('LOWER(ticket.title) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(ticket.description) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(ticket.ticketCode) LIKE LOWER(:search)', {
              search: `%${search}%`,
            });
        }),
      );
    }

    // ── Classification & Status Filters ──
    if (category && category.length > 0) {
      qb.andWhere('ticket.category IN (:...category)', { category });
    }
    if (priority && priority.length > 0) {
      qb.andWhere('ticket.priority IN (:...priority)', { priority });
    }
    if (status && status.length > 0) {
      qb.andWhere('ticket.status IN (:...status)', { status });
    }

    // ── Department Queues & Routing ──
    if (targetDepartmentId && targetDepartmentId.length > 0) {
      qb.andWhere('ticket.targetDepartmentId IN (:...targetDepartmentId)', {
        targetDepartmentId,
      });
    }
    if (requesterDepartmentId && requesterDepartmentId.length > 0) {
      qb.andWhere(
        'ticket.requesterDepartmentId IN (:...requesterDepartmentId)',
        { requesterDepartmentId },
      );
    }

    // ── People & Assignments ──
    if (requesterId) {
      qb.andWhere('ticket.requesterId = :requesterId', { requesterId });
    }
    if (assigneeId) {
      qb.andWhere('ticket.assigneeId = :assigneeId', { assigneeId });
    }
    if (isUnassigned === true) {
      qb.andWhere('ticket.assigneeId IS NULL');
    }

    // ── Polymorphic ERP Entity Context ──
    if (targetProjectId) {
      qb.andWhere('ticket.targetProjectId = :targetProjectId', {
        targetProjectId,
      });
    }
    if (targetEntityType) {
      qb.andWhere('ticket.targetEntityType = :targetEntityType', {
        targetEntityType,
      });
    }
    if (targetEntityId) {
      qb.andWhere('ticket.targetEntityId = :targetEntityId', {
        targetEntityId,
      });
    }

    // ── SLA Breached Dynamic Resolution ──
    if (isSlaBreached !== undefined) {
      if (isSlaBreached) {
        qb.andWhere(
          '(ticket.isSlaBreached = true OR (ticket.status NOT IN (:...terminalStates) AND ticket.resolutionDueAt < NOW()))',
          {
            terminalStates: [
              TicketStatus.RESOLVED,
              TicketStatus.CLOSED,
              TicketStatus.REJECTED,
            ],
          },
        );
      } else {
        qb.andWhere('ticket.isSlaBreached = false');
      }
    }

    // ── Timeline Boundaries ──
    if (fromDate) qb.andWhere('ticket.createdAt >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('ticket.createdAt <= :toDate', { toDate });

    // ── Ordering & Execution ──
    qb.orderBy(`ticket.${sortBy}`, sortOrder);
    qb.addOrderBy('ticket.id', sortOrder);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id },
      relations: { meetings: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID "${id}" was not found.`);
    }

    return ticket;
  }

  // ==========================================
  // 3. DISPATCH & ASSIGNMENT WORKFLOW
  // ==========================================

  async assign(
    id: string,
    dto: AssignTicketDto,
    user: ExtendedUser,
  ): Promise<Ticket> {
    const ticket = await this.findOne(id);

    this.assertValidTransition(ticket.status, TicketStatus.ASSIGNED);

    // const oldStatus = ticket.status;
    ticket.assigneeId = dto.assigneeId;
    ticket.status = TicketStatus.ASSIGNED;
    ticket.updatedBy = user.id;

    const updated = await this.ticketRepo.save(ticket);

    this.eventEmitter.emit(
      'ticket.assigned',
      new TicketAssignedEvent(
        updated.id,
        updated.ticketCode,
        dto.assigneeId,
        user.id,
        dto.internalHandoverNote,
      ),
    );

    return updated;
  }

  // ==========================================
  // 4. "DISCUSS & MEET" RESOLUTION ENGINE
  // ==========================================

  async scheduleMeeting(
    ticketId: string,
    dto: ScheduleTicketMeetingDto,
    user: ExtendedUser,
  ): Promise<TicketMeeting> {
    const ticket = await this.findOne(ticketId);

    if (
      ticket.status === TicketStatus.RESOLVED ||
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.REJECTED
    ) {
      throw new ConflictException(
        `Cannot schedule meetings for tickets in "${ticket.status}" status.`,
      );
    }

    const meeting = this.meetingRepo.create({
      ticketId: ticket.id,
      meetingId: dto.meetingId ?? null,
      agenda: dto.agenda,
      scheduledStart: new Date(dto.scheduledStart),
      scheduledEnd: new Date(dto.scheduledEnd),
      meetingUrl: dto.meetingUrl ?? null,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const savedMeeting = await this.meetingRepo.save(meeting);

    ticket.status = TicketStatus.MEETING_SCHEDULED;
    ticket.updatedBy = user.id;
    await this.ticketRepo.save(ticket);

    this.eventEmitter.emit(
      'ticket.meeting_scheduled',
      new TicketMeetingScheduledEvent(
        ticket.id,
        ticket.ticketCode,
        savedMeeting.id,
        savedMeeting.agenda,
        savedMeeting.scheduledStart,
        dto.attendeeIds || [],
      ),
    );

    return savedMeeting;
  }

  async recordMeetingOutcomes(
    ticketId: string,
    meetingId: string,
    dto: RecordMeetingOutcomesDto,
    user: ExtendedUser,
  ): Promise<TicketMeeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId, ticketId },
    });

    if (!meeting) {
      throw new NotFoundException(
        `Meeting entry "${meetingId}" not linked to ticket "${ticketId}".`,
      );
    }

    meeting.outcomesSummary = dto.outcomesSummary;
    meeting.actionItems = dto.actionItems;
    meeting.updatedBy = user.id;

    const savedMeeting = await this.meetingRepo.save(meeting);

    // Revert ticket status back to IN_PROGRESS so it can be resolved or worked on
    const ticket = await this.findOne(ticketId);
    if (ticket.status === TicketStatus.MEETING_SCHEDULED) {
      ticket.status = TicketStatus.IN_PROGRESS;
      ticket.updatedBy = user.id;
      await this.ticketRepo.save(ticket);
    }

    return savedMeeting;
  }

  // ==========================================
  // 5. RESOLUTION, CLOSURE & REJECTION
  // ==========================================

  async resolve(
    id: string,
    dto: ResolveTicketDto,
    user: ExtendedUser,
  ): Promise<Ticket> {
    const ticket = await this.findOne(id);

    this.assertValidTransition(ticket.status, TicketStatus.RESOLVED);

    // Business Invariant: All scheduled meetings must possess outcomes prior to resolving
    const pendingMeetings = await this.meetingRepo.find({
      where: { ticketId: id },
    });

    const hasIncompleteMeeting = pendingMeetings.some(
      (m) => !m.outcomesSummary || m.outcomesSummary.trim().length === 0,
    );

    if (hasIncompleteMeeting) {
      throw new ConflictException(
        'All scheduled cross-departmental sync meetings must have registered outcomes before resolution.',
      );
    }

    ticket.status = TicketStatus.RESOLVED;
    ticket.resolutionNote = dto.resolutionNote;
    ticket.updatedBy = user.id;

    const resolvedTicket = await this.ticketRepo.save(ticket);

    this.eventEmitter.emit(
      'ticket.resolved',
      new TicketResolvedEvent(
        resolvedTicket.id,
        resolvedTicket.ticketCode,
        resolvedTicket.requesterId,
        user.id,
        dto.resolutionNote,
      ),
    );

    return resolvedTicket;
  }

  async reject(
    id: string,
    dto: RejectTicketDto,
    user: ExtendedUser,
  ): Promise<Ticket> {
    const ticket = await this.findOne(id);

    this.assertValidTransition(ticket.status, TicketStatus.REJECTED);

    const oldStatus = ticket.status;
    ticket.status = TicketStatus.REJECTED;
    ticket.rejectionReason = dto.rejectionReason;
    ticket.updatedBy = user.id;

    const rejectedTicket = await this.ticketRepo.save(ticket);

    this.eventEmitter.emit(
      'ticket.status_changed',
      new TicketStatusChangedEvent(
        rejectedTicket.id,
        rejectedTicket.ticketCode,
        rejectedTicket.requesterId,
        oldStatus,
        TicketStatus.REJECTED,
        user.id,
        dto.rejectionReason,
        rejectedTicket.assigneeId,
      ),
    );

    return rejectedTicket;
  }

  async close(id: string, user: ExtendedUser): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new BadRequestException(
        'Only tickets in RESOLVED state can be formally closed.',
      );
    }

    ticket.status = TicketStatus.CLOSED;
    ticket.updatedBy = user.id;

    return this.ticketRepo.save(ticket);
  }

  async reopen(
    id: string,
    reason: string,
    user: ExtendedUser,
  ): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new BadRequestException(
        'Only resolved tickets can be disputed and reopened.',
      );
    }

    ticket.status = TicketStatus.REOPENED;
    ticket.updatedBy = user.id;
    ticket.resolutionNote = `[REOPENED: ${reason}]\nPrevious: ${ticket.resolutionNote || 'None'}`;

    return this.ticketRepo.save(ticket);
  }

  // ==========================================
  // 6. INTERNAL VALIDATIONS & SLA HELPERS
  // ==========================================

  private assertValidTransition(
    current: TicketStatus,
    target: TicketStatus,
  ): void {
    const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
      [TicketStatus.DRAFT]: [TicketStatus.SUBMITTED],
      [TicketStatus.SUBMITTED]: [
        TicketStatus.ASSIGNED,
        TicketStatus.IN_PROGRESS,
        TicketStatus.REJECTED,
      ],
      [TicketStatus.ASSIGNED]: [
        TicketStatus.ASSIGNED, // Cho phép tái phân công
        TicketStatus.IN_PROGRESS,
        TicketStatus.PENDING_INFO,
        TicketStatus.MEETING_SCHEDULED,
        TicketStatus.REJECTED,
      ],
      [TicketStatus.IN_PROGRESS]: [
        TicketStatus.ASSIGNED, // Bàn giao nhân sự khác
        TicketStatus.PENDING_INFO,
        TicketStatus.MEETING_SCHEDULED,
        TicketStatus.RESOLVED,
        TicketStatus.REJECTED,
      ],
      [TicketStatus.PENDING_INFO]: [
        TicketStatus.IN_PROGRESS,
        TicketStatus.RESOLVED,
        TicketStatus.REJECTED,
      ],
      [TicketStatus.MEETING_SCHEDULED]: [
        TicketStatus.IN_PROGRESS,
        TicketStatus.RESOLVED,
      ],
      [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
      [TicketStatus.REOPENED]: [
        TicketStatus.ASSIGNED,
        TicketStatus.IN_PROGRESS,
        TicketStatus.MEETING_SCHEDULED,
        TicketStatus.RESOLVED,
      ],
      [TicketStatus.CLOSED]: [],
      [TicketStatus.REJECTED]: [TicketStatus.SUBMITTED], // Can resubmit if corrected
    };

    const targets = allowedTransitions[current] || [];
    if (!targets.includes(target)) {
      throw new ConflictException(
        `Illegal state transition from "${current}" to "${target}".`,
      );
    }
  }

  private calculateSlaDueDates(
    priority: TicketPriority,
    startDate: Date,
  ): { responseDueAt: Date; resolutionDueAt: Date } {
    const responseHoursMap: Record<TicketPriority, number> = {
      [TicketPriority.BLOCKER]: 1,
      [TicketPriority.URGENT]: 2,
      [TicketPriority.HIGH]: 4,
      [TicketPriority.NORMAL]: 8,
      [TicketPriority.LOW]: 24,
    };

    const resolutionHoursMap: Record<TicketPriority, number> = {
      [TicketPriority.BLOCKER]: 4,
      [TicketPriority.URGENT]: 8,
      [TicketPriority.HIGH]: 24,
      [TicketPriority.NORMAL]: 48,
      [TicketPriority.LOW]: 96,
    };

    const responseDueAt = new Date(
      startDate.getTime() + responseHoursMap[priority] * 60 * 60 * 1000,
    );
    const resolutionDueAt = new Date(
      startDate.getTime() + resolutionHoursMap[priority] * 60 * 60 * 1000,
    );

    return { responseDueAt, resolutionDueAt };
  }

  private generateUniqueTicketCode(departmentCode: string): string {
    const year = new Date().getFullYear();
    const cleanDept = departmentCode
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .substring(0, 4);
    const randomSuffix = randomBytes(2).toString('hex').toUpperCase();
    return `TCK-${cleanDept}-${year}-${randomSuffix}`;
  }
}
