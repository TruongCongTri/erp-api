// ==========================================
// 1. MAIN TICKET ENTITY

import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditableEntity } from '../../common/entities/auditable.entity';
import { TicketCategory, TicketPriority, TicketStatus } from '../ticket.types';
import { TicketMeeting } from './ticket-meeting.entity';

// ==========================================
@Entity({ name: 'tickets' })
@Index('idx_ticket_queue', ['targetDepartmentId', 'status', 'priority'])
@Index('idx_ticket_requester', ['requesterId', 'status'])
@Index('idx_ticket_assignee', ['assigneeId', 'status'])
export class Ticket extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ticket_code', type: 'varchar', length: 32, unique: true })
  ticketCode!: string; // e.g., "TCK-MEP-2026-0042"

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  // ─── Classification ───
  @Column({ type: 'enum', enum: TicketCategory })
  category!: TicketCategory; // COORDINATION, CONFLICT, HANDOFF, SERVICE_REQUEST

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.NORMAL,
  })
  priority!: TicketPriority; // LOW, NORMAL, HIGH, BLOCKER

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.SUBMITTED })
  status!: TicketStatus;

  // ─── Routing: Source & Target ───
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @Column({ name: 'requester_department_id', type: 'varchar', length: 64 })
  requesterDepartmentId!: string;

  @Column({ name: 'target_department_id', type: 'varchar', length: 64 })
  targetDepartmentId!: string;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId!: string | null; // Nullable when in the unassigned department queue

  // ─── ERP Polymorphic Binding ───
  // Binds ticket directly to any ERP asset (BIM model, PO, Employee, etc.)
  @Column({
    name: 'target_entity_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  targetEntityType?: string | null;

  @Column({
    name: 'target_entity_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  targetEntityId?: string | null;

  @Column({
    name: 'target_project_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  targetProjectId?: string | null; // For EPC projects (e.g., "PRJ-METRO-01")

  // ─── SLA Engine ───
  @Column({ name: 'response_due_at', type: 'timestamptz', nullable: true })
  responseDueAt?: Date | null;

  @Column({ name: 'resolution_due_at', type: 'timestamptz', nullable: true })
  resolutionDueAt?: Date | null;

  @Column({ name: 'is_sla_breached', type: 'boolean', default: false })
  isSlaBreached!: boolean;

  // ─── Resolution Summary ───
  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote?: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  // ─── Relationships ───

  @OneToMany(() => TicketMeeting, (meeting) => meeting.ticket)
  meetings?: TicketMeeting[];
}
