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
  EducationLevel,
  PlatformSource,
  CvStorageLocation,
} from '../enums/ats.enum';
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

  @Column({ name: 'cv_purge_at', type: 'timestamp', nullable: true })
  cvPurgeAt?: Date | null; // Thời điểm dự kiến tự động xóa CV (7 ngày sau khi bị AI đánh giá LOW), null nếu HR đã giữ lại hoặc đã xóa

  @Column({
    name: 'cv_storage_location',
    type: 'enum',
    enum: CvStorageLocation,
    default: CvStorageLocation.S3,
  })
  cvStorageLocation!: CvStorageLocation; // Nơi tệp CV thực sự đang được lưu: S3 hoặc tạm trên đĩa cục bộ chờ upload lại

  // ─── AI Extraction & Scoring Audit ───

  @Column({ name: 'raw_cv_text', type: 'text', nullable: true, select: false })
  rawCvText?: string | null;

  @Column({
    name: 'extracted_hard_skills',
    type: 'text',
    array: true,
    default: '{}',
  })
  extractedHardSkills?: string[];

  @Column({
    name: 'extracted_soft_skills',
    type: 'text',
    array: true,
    default: '{}',
  })
  extractedSoftSkills?: string[];

  @Column({
    name: 'extracted_experience_years',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  extractedExperienceYears?: number | null;

  @Column({
    name: 'extracted_education_level',
    type: 'enum',
    enum: EducationLevel,
    nullable: true,
  })
  extractedEducationLevel?: EducationLevel | null;

  @Column({
    name: 'extracted_certifications',
    type: 'text',
    array: true,
    default: '{}',
  })
  extractedCertifications?: string[];

  @Column({
    name: 'extracted_employment_history',
    type: 'jsonb',
    nullable: true,
  })
  extractedEmploymentHistory?: Array<{
    company: string;
    role: string;
    durationMonths: number;
  }> | null;

  @Column({ name: 'extracted_summary', type: 'text', nullable: true })
  extractedSummary?: string | null;

  @Column({ name: 'scoring_breakdown', type: 'jsonb', nullable: true })
  scoringBreakdown?: Record<string, unknown> | null;

  @Column({ name: 'matching_skills', type: 'text', array: true, default: '{}' })
  matchingSkills?: string[];

  @Column({ name: 'missing_skills', type: 'text', array: true, default: '{}' })
  missingSkills?: string[];

  @Column({ name: 'red_flags', type: 'text', array: true, default: '{}' })
  redFlags?: string[];

  @Column({
    name: 'model_evaluated',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  modelEvaluated?: string | null;
}
