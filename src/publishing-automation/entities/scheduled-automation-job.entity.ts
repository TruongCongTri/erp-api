import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import {
  AutomationPlatform,
  AutomationJobStatus,
} from '../enums/publishing-automation.enum';
import { ManagedFacebookGroup } from './managed-facebook-group.entity';

@Entity('scheduled_automation_jobs')
@Index('idx_scheduled_automation_jobs_status', ['status'])
@Index('idx_scheduled_automation_jobs_scheduled_at', ['scheduledAt'])
export class ScheduledAutomationJob extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ats_job_posting_id', type: 'varchar', length: 100 })
  atsJobPostingId!: string;

  @Column({ type: 'enum', enum: AutomationPlatform })
  platform!: AutomationPlatform;

  @Column({ name: 'target_destination', type: 'varchar', length: 500 })
  targetDestination!: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null;

  @ManyToOne(() => ManagedFacebookGroup, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group?: ManagedFacebookGroup | null;

  @Column({ name: 'job_title', type: 'varchar', length: 255, nullable: true })
  jobTitle?: string | null;

  @Column({ name: 'job_description', type: 'text', nullable: true })
  jobDescription?: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({
    type: 'enum',
    enum: AutomationJobStatus,
    default: AutomationJobStatus.PENDING,
  })
  status!: AutomationJobStatus;

  @Column({
    name: 'screenshot_error_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  screenshotErrorPath?: string | null;

  @Column({
    name: 'published_post_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  publishedPostUrl?: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'last_error_message', type: 'text', nullable: true })
  lastErrorMessage?: string | null;
}
