// ==========================================
// 2. TICKET MEETING LINK ENTITY

import { AuditableEntity } from 'src/common/entities/auditable.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';

// ==========================================
@Entity({ name: 'ticket_meetings' })
@Index('idx_ticket_meeting_ticket', ['ticketId'])
export class TicketMeeting extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.meetings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket;

  @Column({ name: 'meeting_id', type: 'uuid', nullable: true })
  meetingId?: string | null; // Foreign key linking directly to `/vi/meetings`

  @Column({ type: 'varchar', length: 255 })
  agenda!: string;

  @Column({ name: 'scheduled_start', type: 'timestamptz' })
  scheduledStart!: Date;

  @Column({ name: 'scheduled_end', type: 'timestamptz' })
  scheduledEnd!: Date;

  @Column({ name: 'meeting_url', type: 'varchar', length: 500, nullable: true })
  meetingUrl?: string | null;

  @Column({ name: 'action_items', type: 'jsonb', nullable: true })
  actionItems?: Array<{
    task: string;
    assigneeId: string;
    dueDate: string;
  }> | null;

  @Column({ name: 'outcomes_summary', type: 'text', nullable: true })
  outcomesSummary?: string | null; // Required before closing ticket
}
