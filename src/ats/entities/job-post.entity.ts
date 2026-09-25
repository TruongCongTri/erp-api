import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
  // VirtualColumn,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import {
  JobLevel,
  JobPostCreationMethod,
  JobPostStatus,
  JobType,
  WorkingModel,
  EducationLevel,
  CandidateGender,
  PlatformSource,
} from '../enums/ats.enum';
import { RecruitmentRequest } from './recruitment-request.entity';
import { JobApplication } from './job-application.entity';

@Entity('job_posts')
// ── 1. Tối ưu Composite Index phục vụ Career Portal & Quản trị HR (Tránh Seq Scan) ──
@Index('idx_job_posts_status_published', ['status', 'publishedAt'])
@Index('idx_job_posts_status_created', ['status', 'createdAt'])
@Index('idx_job_posts_scheduled_worker', ['status', 'scheduledPublishAt'])
@Index('idx_job_posts_filter_lookup', [
  'status',
  'specialization',
  'workingModel',
])
@Index('idx_job_posts_deadline_lookup', ['status', 'applicationDeadline'])
@Index('idx_job_posts_is_template', ['isTemplate'])
export class JobPost extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'job_code', type: 'varchar', length: 32, unique: true })
  jobCode!: string; // e.g., "JOB-2026-0089"

  @Column({ name: 'is_template', type: 'boolean', default: false })
  isTemplate!: boolean; // Allows future requests to clone from this JD

  @Column({
    name: 'creation_method',
    type: 'enum',
    enum: JobPostCreationMethod,
    default: JobPostCreationMethod.MANUAL,
  })
  creationMethod!: JobPostCreationMethod;

  @Column({
    type: 'enum',
    enum: JobPostStatus,
    default: JobPostStatus.DRAFT,
  })
  status!: JobPostStatus;

  // ─── 1. Thông tin chung (Lean List Metadata) ───

  @Column({ name: 'public_title', type: 'varchar', length: 255 })
  publicTitle!: string;

  @Column({ type: 'varchar', length: 150 })
  specialization!: string;

  @Column({ name: 'domain_knowledge', type: 'varchar', length: 150 })
  domainKnowledge!: string;

  @Column({ type: 'enum', enum: JobLevel })
  level!: JobLevel;

  @Column({
    name: 'job_type',
    type: 'enum',
    enum: JobType,
    default: JobType.FULL_TIME,
  })
  jobType!: JobType;

  @Column({
    name: 'working_model',
    type: 'enum',
    enum: WorkingModel,
    default: WorkingModel.ON_SITE,
  })
  workingModel!: WorkingModel;

  @Column({ name: 'salary_min', type: 'bigint', default: 0 })
  salaryMin!: number;

  @Column({ name: 'salary_max', type: 'bigint', default: 0 })
  salaryMax!: number;

  @Column({ name: 'is_salary_negotiable', type: 'boolean', default: true })
  isSalaryNegotiable!: boolean;

  // ─── 2. Mô tả công việc (Heavy Text Columns -> select: false để tối ưu Payload) ───

  @Column({ name: 'job_description', type: 'text', select: false })
  jobDescription!: string;

  @Column({ type: 'text', select: false })
  requirements!: string;

  @Column({ type: 'text', select: false })
  benefits!: string;

  @Column({
    name: 'extra_benefits',
    type: 'text',
    nullable: true,
    select: false,
  })
  extraBenefits?: string | null;

  @Column({ name: 'work_locations', type: 'jsonb' })
  workLocations!: Array<{ label: string; address: string }>;

  @Column({ name: 'working_hours_standard', type: 'varchar', length: 255 })
  workingHoursStandard!: string; // e.g., "Thứ 2 – Thứ 6: 08:00 – 17:00"

  @Column({ name: 'working_hours_detail', type: 'text' })
  workingHoursDetail!: string;

  // ─── 3. Kỳ vọng về ứng viên (Candidate Expectations) ───

  @Column({
    name: 'min_education',
    type: 'enum',
    enum: EducationLevel,
    default: EducationLevel.BACHELOR,
  })
  minEducation!: EducationLevel;

  @Column({ name: 'experience_years', type: 'int', default: 0 })
  experienceYears!: number;

  @Column({
    type: 'enum',
    enum: CandidateGender,
    default: CandidateGender.ANY,
  })
  gender!: CandidateGender;

  @Column({ name: 'age_min', type: 'smallint', nullable: true })
  ageMin?: number | null;

  @Column({ name: 'age_max', type: 'smallint', nullable: true })
  ageMax?: number | null;

  @Column({
    name: 'must_have_skills',
    type: 'text',
    array: true,
    default: '{}',
  })
  mustHaveSkills!: string[];

  @Column({
    name: 'nice_to_have_skills',
    type: 'text',
    array: true,
    default: '{}',
  })
  niceToHaveSkills!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  languages!: string[];

  // ─── 4. Thông tin nhận hồ sơ (Application Intake) ───

  @Column({ name: 'application_deadline', type: 'date' })
  applicationDeadline!: Date;

  @Column({ type: 'int', default: 1 })
  headcount!: number;

  @Column({ name: 'hr_recipient_name', type: 'varchar', length: 150 })
  hrRecipientName!: string;

  @Column({ name: 'hr_recipient_phone', type: 'varchar', length: 30 })
  hrRecipientPhone!: string;

  @Column({ name: 'hr_recipient_email', type: 'varchar', length: 150 })
  hrRecipientEmail!: string;

  @Column({
    name: 'campaign_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  campaignName?: string | null;

  // ─── 5. Phân phối đa kênh & Lịch biểu (Multi-Platform Publishing) ───

  @Column({
    name: 'target_platforms',
    type: 'enum',
    enum: PlatformSource,
    array: true,
    default: [PlatformSource.COMPANY_WEBSITE],
  })
  targetPlatforms!: PlatformSource[];

  @Column({ name: 'scheduled_publish_at', type: 'timestamptz', nullable: true })
  scheduledPublishAt?: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  @Column({ name: 'external_mapping', type: 'jsonb', default: {} })
  externalMapping!: Record<string, string>; // e.g., { linkedin: "job-12345", topcv: "post-67890" }

  // ─── Relational Links ───

  // Bổ sung Index cho FK quan hệ 1-1 với RecruitmentRequest
  @Index('idx_job_posts_recruitment_request_id')
  @Column({ name: 'recruitment_request_id', type: 'uuid', nullable: true })
  recruitmentRequestId?: string | null;

  @OneToOne(() => RecruitmentRequest, (req) => req.jobPost, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recruitment_request_id' })
  recruitmentRequest?: RecruitmentRequest | null;

  @OneToMany(() => JobApplication, (application) => application.jobPost)
  applications?: JobApplication[];

  // @VirtualColumn({
  //   query: (alias) =>
  //     `SELECT COUNT(id) FROM job_applications WHERE job_post_id = ${alias}.id`,
  // })
  // applicationsCount?: number;
}
