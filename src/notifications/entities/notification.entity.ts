import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  ActionState,
  ActorType,
  DeliveryChannel,
  NotificationCategory,
  NotificationPriority,
} from '../enums/notification.enum';
import {
  ActorSnapshot,
  InlineActionItem,
} from '../types/notification.interface';

// ==========================================
// NOTIFICATION ENTITY
// ==========================================

@Entity({ name: 'notifications' })
@Index('idx_notif_user_unread', ['recipientId', 'isRead', 'createdAt'])
@Index('idx_notif_dept', ['recipientId', 'departmentId', 'createdAt'])
@Index('idx_notif_target', [
  'targetEntityType',
  'targetEntityId',
  'recipientId',
])
export class Notification {
  // ─── 1. Identity & Routing ───

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'department_id', type: 'varchar', length: 64 })
  departmentId!: string;

  // ─── 2. Event Classification & Taxonomy ───

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    default: NotificationCategory.TASK,
  })
  category!: NotificationCategory;

  @Column({ name: 'task_type', type: 'varchar', length: 100 })
  taskType!: string;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.NORMAL,
  })
  priority!: NotificationPriority;

  @Column({ name: 'task_status', type: 'varchar', length: 50, nullable: true })
  taskStatus!: string | null;

  // ─── 3. Actor & Source ───

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: ActorType,
    default: ActorType.SYSTEM_CRON,
  })
  actorType!: ActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_snapshot', type: 'jsonb', nullable: true })
  actorSnapshot!: ActorSnapshot | null;

  // ─── 4. Content & Localization ───

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'i18n_key', type: 'varchar', length: 150, nullable: true })
  i18nKey!: string | null;

  @Column({ name: 'i18n_params', type: 'jsonb', nullable: true })
  i18nParams!: Record<string, unknown> | null;

  @Column({ name: 'icon_slug', type: 'varchar', length: 64, nullable: true })
  iconSlug!: string | null;

  // ─── 5. Target Entity & Deep Linking ───

  @Column({ name: 'target_entity_type', type: 'varchar', length: 100 })
  targetEntityType!: string;

  @Column({ name: 'target_entity_id', type: 'varchar', length: 100 })
  targetEntityId!: string;

  @Column({ name: 'action_url', type: 'varchar', length: 500 })
  actionUrl!: string;

  // ─── 6. Lifecycle, Read State & Inline Actions ───

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'is_actionable', type: 'boolean', default: false })
  isActionable!: boolean;

  @Column({
    name: 'action_state',
    type: 'enum',
    enum: ActionState,
    default: ActionState.NONE,
  })
  actionState!: ActionState;

  @Column({ name: 'action_payload', type: 'jsonb', nullable: true })
  actionPayload!: InlineActionItem[] | null;

  // ─── 7. Delivery & Audit Tracking ───

  @Column({
    name: 'delivery_channels',
    type: 'enum',
    enum: DeliveryChannel,
    array: true,
    default: [DeliveryChannel.IN_APP],
  })
  deliveryChannels!: DeliveryChannel[];

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived!: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
