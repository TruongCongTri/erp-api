import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import {
  ActorRoleLevel,
  AuditActionType,
  AuditClientApp,
  type AuditDiffPayload,
  AuditStatus,
} from '../audit-log.types';

@Entity({ name: 'audit_logs' })
// High-frequency query compound indexes
@Index('idx_audit_tracking', ['trackingCode'])
@Index('idx_audit_dept_time', ['targetDepartmentId', 'timestamp'])
@Index('idx_audit_actor_time', ['actorId', 'timestamp'])
@Index('idx_audit_resource_target', ['resourceSlug', 'targetEntityId'])
@Index('idx_audit_correlation', ['correlationId'])
export class AuditLog {
  // ─── 1. Identity & Traceability ───

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tracking_code', type: 'varchar', length: 32 })
  trackingCode!: string; // e.g., "#appr-004", "#req-001"

  @Column({ name: 'correlation_id', type: 'varchar', length: 64 })
  correlationId!: string; // Distributed trace ID linking sub-actions

  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz' })
  timestamp!: Date; // Execution timestamp (Partition range key)

  // ─── 2. Actor Profile & Hierarchy ───

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 120 })
  actorName!: string; // e.g., "Sơn Lêu", "Phạm Ngọc Hà"

  @Column({ name: 'actor_initials', type: 'varchar', length: 4 })
  actorInitials!: string; // e.g., "SL", "PH"

  @Column({
    name: 'actor_avatar_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  actorAvatarUrl!: string | null;

  @Column({ name: 'actor_department_id', type: 'varchar', length: 64 })
  actorDepartmentId!: string; // e.g., "hr", "finance", "construction"

  @Column({
    name: 'actor_role_level',
    type: 'enum',
    enum: ActorRoleLevel,
    default: ActorRoleLevel.STAFF,
  })
  actorRoleLevel!: ActorRoleLevel;

  @Column({ name: 'actor_title', type: 'varchar', length: 100 })
  actorTitle!: string; // e.g., "HR Admin", "Trưởng phòng MEP"

  @Column({ name: 'impersonated_by', type: 'uuid', nullable: true })
  impersonatedBy!: string | null; // Superadmin ID if running as proxy

  // ─── 3. Target Resource & Scope ───

  @Column({ name: 'target_department_id', type: 'varchar', length: 64 })
  targetDepartmentId!: string; // Department scope owning the resource

  @Column({ name: 'resource_slug', type: 'varchar', length: 64 })
  resourceSlug!: string; // e.g., "leave_request", "ats_jobs", "po"

  @Column({ name: 'resource_label', type: 'varchar', length: 100 })
  resourceLabel!: string; // e.g., "Phê duyệt", "Tuyển dụng", "Cung ứng"

  @Column({ name: 'target_entity_id', type: 'varchar', length: 100 })
  targetEntityId!: string;

  @Column({
    name: 'target_project_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  targetProjectId!: string | null; // For EPC projects (e.g., "PRJ-METRO-01")

  // ─── 4. Action & Execution Status ───

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: AuditActionType,
  })
  actionType!: AuditActionType;

  @Column({ name: 'action_label', type: 'varchar', length: 64 })
  actionLabel!: string; // e.g., "Phê duyệt", "Tạo mới", "Từ chối"

  @Column({
    type: 'enum',
    enum: AuditStatus,
    default: AuditStatus.SUCCESS,
  })
  status!: AuditStatus;

  @Column({ type: 'text' })
  summary!: string; // e.g., "Phê duyệt đơn xin nghỉ phép 3 ngày (02/09 – 04/09/2026)"

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  // ─── 5. Granular Field Diff & Snapshots ───

  @Column({ name: 'diff_payload', type: 'jsonb' })
  diffPayload!: AuditDiffPayload;

  @Column({ name: 'snapshot_before', type: 'jsonb', nullable: true })
  snapshotBefore!: Record<string, unknown> | null;

  @Column({ name: 'snapshot_after', type: 'jsonb', nullable: true })
  snapshotAfter!: Record<string, unknown> | null;

  // ─── 6. Client, Network & Security Context ───

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress!: string; // e.g., "192.168.1.45"

  @Column({ name: 'user_agent', type: 'varchar', length: 500 })
  userAgent!: string;

  @Column({
    name: 'client_app',
    type: 'enum',
    enum: AuditClientApp,
    default: AuditClientApp.WEB_PORTAL,
  })
  clientApp!: AuditClientApp;

  @Column({ name: 'request_url', type: 'varchar', length: 500 })
  requestUrl!: string; // e.g., "PATCH /api/v1/approvals/appr-004"
}
