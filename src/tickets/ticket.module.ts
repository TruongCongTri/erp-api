import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketMeeting } from './entities/ticket-meeting.entity';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { TicketSlaScheduler } from './ticket-sla.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketMeeting])],
  controllers: [TicketController],
  providers: [TicketService, TicketSlaScheduler],
  exports: [TicketService],
})
export class TicketModule {}
