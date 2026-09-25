import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  // CreateDateColumn,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { ApplicationPhase, AiScreeningTier } from '../enums/ats.enum';
import { CandidateProfile } from './candidate-profile.entity';
import { JobPost } from './job-post.entity';
import { ApplicationSubmission } from './application-submission.entity';

@Entity('job_applications')
// ── TIÊU CHÍ 1: TỐI ƯU HÓA INDEX CƠ SỞ DỮ LIỆU (CHỐNG SEQUENTIAL SCAN) ──

// 1. Partial Unique Index: 1 Ứng viên chỉ nộp 1 lần/Job (Loại trừ bản ghi Soft Delete & Hồ sơ nộp tự do)
@Index('idx_candidate_job_unique', ['candidateId', 'jobPostId'], {
  unique: true,
  where: 'deleted_at IS NULL AND job_post_id IS NOT NULL',
})
// 2. Composite Index cho Kanban Pipeline & Sắp xếp theo ngày nộp (Tối ưu truy vấn findByJobPost)
@Index('idx_job_app_pipeline_list', ['jobPostId', 'status', 'createdAt'])
// ── 2. Composite Index cho Kanban Pipeline & Lọc điểm AI ──
@Index('idx_job_app_pipeline_ranking', ['jobPostId', 'status', 'aiScore'])
// 4. Partial Index cho hồ sơ ứng tuyển tự do (Talent Pool - không gắn Job Post)
@Index('idx_job_app_spontaneous', ['candidateId', 'status'], {
  where: 'job_post_id IS NULL AND deleted_at IS NULL',
})
@Index('idx_job_app_candidate_lookup', ['candidateId', 'createdAt'])
export class JobApplication extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_job_app_candidate_id')
  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.applications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: CandidateProfile;

  // Đổi thành nullable để hỗ trợ Spontaneous Application
  @Index('idx_job_app_job_post_id')
  @Column({ name: 'job_post_id', type: 'uuid', nullable: true })
  jobPostId?: string | null;

  @ManyToOne(() => JobPost, (jobPost) => jobPost.applications, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'job_post_id' })
  jobPost?: JobPost;

  @Column({
    name: 'desired_job_title',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  desiredJobTitle?: string | null;

  @Column({
    type: 'enum',
    enum: ApplicationPhase,
    default: ApplicationPhase.APPLIED,
  })
  status!: ApplicationPhase;

  // ─── AI Evaluation Core (Hiển thị ngay trên thẻ Kanban) ───

  @Column({ name: 'ai_score', type: 'smallint', nullable: true })
  aiScore?: number | null; // 0 to 100

  @Column({
    name: 'ai_tier',
    type: 'enum',
    enum: AiScreeningTier,
    nullable: true,
  })
  aiTier?: AiScreeningTier | null;

  // ─── Heavy Data Columns (select: false để tối ưu Kanban Pipeline API) ───

  @Column({ name: 'ai_reasoning', type: 'text', nullable: true, select: false })
  aiReasoning?: string | null;

  @Column({
    name: 'internal_hr_notes',
    type: 'text',
    nullable: true,
    select: false,
  })
  internalHrNotes?: string | null;

  // @CreateDateColumn()
  // appliedAt!: Date;
  // ─── Granular Evaluation Metrics ───

  @Column({
    name: 'scoring_breakdown',
    type: 'jsonb',
    nullable: true,
    select: false,
  })
  scoringBreakdown?: Record<string, unknown> | null;

  @Column({ name: 'matching_skills', type: 'text', array: true, default: '{}' })
  matchingSkills?: string[];

  @Column({ name: 'missing_skills', type: 'text', array: true, default: '{}' })
  missingSkills?: string[];

  @Column({
    name: 'experience_years_detected',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  experienceYearsDetected?: number | null;

  @Column({ name: 'red_flags', type: 'text', array: true, default: '{}' })
  redFlags?: string[];

  @OneToMany(
    () => ApplicationSubmission,
    (submission) => submission.application,
  )
  submissions?: ApplicationSubmission[];
}
