import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { RetentionAction } from '../audit-log.types';

@Entity({ name: 'audit_retention_policies' })
@Unique('uq_retention_dept_resource', ['departmentId', 'resourceSlug'])
export class AuditRetentionPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'department_id', type: 'varchar', length: 64 })
  departmentId!: string; // e.g., "hr", "finance", "it_system"

  @Column({
    name: 'resource_slug',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  resourceSlug!: string | null; // Null applies to all resources under the department

  @Column({ name: 'retention_days', type: 'integer', default: 730 })
  retentionDays!: number; // e.g., 365, 730, 2555 (7 years)

  @Column({
    name: 'retention_action',
    type: 'enum',
    enum: RetentionAction,
    default: RetentionAction.COLD_STORAGE_S3,
  })
  retentionAction!: RetentionAction;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
