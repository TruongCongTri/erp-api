import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ExportJobStatus } from '../audit-log.types';

@Entity({ name: 'audit_export_jobs' })
@Index('idx_audit_export_requester', ['requestedById', 'createdAt'])
export class AuditExportJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requested_by_id', type: 'uuid' })
  requestedById!: string;

  @Column({ name: 'requested_by_name', type: 'varchar', length: 120 })
  requestedByName!: string;

  @Column({ name: 'filter_params', type: 'jsonb' })
  filterParams!: Record<string, unknown>; // Snapshot of query filters used for export

  @Column({
    type: 'enum',
    enum: ExportJobStatus,
    default: ExportJobStatus.PENDING,
  })
  status!: ExportJobStatus;

  @Column({ name: 'total_records', type: 'integer', default: 0 })
  totalRecords!: number;

  @Column({ name: 'file_url', type: 'varchar', length: 500, nullable: true })
  fileUrl!: string | null; // Presigned S3/MinIO link

  @Column({
    name: 'file_checksum',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  fileChecksum!: string | null; // SHA-256 for audit tamper verification

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
