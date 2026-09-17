import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { GroupMembershipStatus } from '../enums/publishing-automation.enum';
import { FacebookAccount } from './facebook-account.entity';

@Entity('managed_facebook_groups')
@Index('idx_managed_fb_groups_membership_status', ['membershipStatus'])
export class ManagedFacebookGroup extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'group_url', type: 'varchar', length: 500, unique: true })
  groupUrl!: string;

  @Column({ name: 'job_types', type: 'text', array: true, default: '{}' })
  jobTypes!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  keywords!: string[];

  @Column({ name: 'assigned_account_id', type: 'uuid' })
  assignedAccountId!: string;

  @ManyToOne(() => FacebookAccount, (account) => account.groups, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'assigned_account_id' })
  assignedAccount?: FacebookAccount;

  @Column({
    name: 'membership_status',
    type: 'enum',
    enum: GroupMembershipStatus,
    default: GroupMembershipStatus.PENDING_APPROVAL,
  })
  membershipStatus!: GroupMembershipStatus;

  @Column({ name: 'daily_post_limit', type: 'int', default: 2 })
  dailyPostLimit!: number;

  @Column({ name: 'cooldown_minutes', type: 'int', default: 60 })
  cooldownMinutes!: number;

  @Column({ name: 'last_posted_at', type: 'timestamptz', nullable: true })
  lastPostedAt?: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
