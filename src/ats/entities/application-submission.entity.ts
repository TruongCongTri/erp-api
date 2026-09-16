import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { PlatformSource } from '../enums/ats.enum';
import { JobApplication } from './job-application.entity';

@Entity('application_submissions')
@Index('idx_submission_platform', ['platformSource', 'externalApplicationId'])
export class ApplicationSubmission extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => JobApplication, (app) => app.submissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application!: JobApplication;

  @Column({
    name: 'platform_source',
    type: 'enum',
    enum: PlatformSource,
    default: PlatformSource.COMPANY_WEBSITE,
  })
  platformSource!: PlatformSource;

  @Column({
    name: 'external_application_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  externalApplicationId?: string | null;

  @Column({ name: 'cover_letter', type: 'text', nullable: true })
  coverLetter?: string | null;

  @Column({ name: 'cv_url', type: 'varchar', length: 500 })
  cvUrl!: string;

  @Column({ name: 'cv_file_key', type: 'varchar', length: 255, nullable: true })
  cvFileKey?: string | null; // S3 or object storage key

  @Column({ name: 'ai_score', type: 'smallint', nullable: true })
  aiScore?: number | null;

  @Column({ name: 'ai_reasoning', type: 'text', nullable: true })
  aiReasoning?: string | null;

  @Column({ name: 'ai_tier', type: 'varchar', length: 30, nullable: true })
  aiTier?: string | null;

  @Column({ name: 'is_cv_purged', type: 'boolean', default: false })
  isCvPurged?: boolean; // Cờ đánh dấu file CV đã được tự động dọn dẹp khỏi S3
}
