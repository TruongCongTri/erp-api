import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Ticket } from './entities/ticket.entity';
import { TicketStatus } from './ticket.types';

@Injectable()
export class TicketSlaScheduler {
  private readonly logger = new Logger(TicketSlaScheduler.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async evaluateTicketSlaBreaches(): Promise<void> {
    const nonTerminalStatuses = [
      TicketStatus.DRAFT,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
      TicketStatus.REJECTED,
    ];

    const breachedTickets = await this.ticketRepo
      .createQueryBuilder('ticket')
      .where('ticket.isSlaBreached = false')
      .andWhere('ticket.status NOT IN (:...nonTerminalStatuses)', {
        nonTerminalStatuses,
      })
      .andWhere('ticket.resolutionDueAt < NOW()')
      .getMany();

    if (breachedTickets.length === 0) return;

    this.logger.warn(
      `Found ${breachedTickets.length} tickets breaching SLA terms.`,
    );

    for (const ticket of breachedTickets) {
      ticket.isSlaBreached = true;
      await this.ticketRepo.save(ticket);

      this.eventEmitter.emit('ticket.sla_breached', {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        targetDepartmentId: ticket.targetDepartmentId,
        priority: ticket.priority,
        resolutionDueAt: ticket.resolutionDueAt,
      });
    }
  }
}
