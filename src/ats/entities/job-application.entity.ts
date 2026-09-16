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
@Index('idx_candidate_job_unique', ['candidateId', 'jobPostId'], {
  unique: true,
})
@Index('idx_job_applications_status', ['jobPostId', 'status'])
export class JobApplication extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => CandidateProfile, (candidate) => candidate.applications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: CandidateProfile;

  @Column({ name: 'job_post_id', type: 'uuid' })
  jobPostId!: string;

  @ManyToOne(() => JobPost, (jobPost) => jobPost.applications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'job_post_id' })
  jobPost!: JobPost;

  @Column({
    type: 'enum',
    enum: ApplicationPhase,
    default: ApplicationPhase.APPLIED,
  })
  status!: ApplicationPhase;

  // ─── AI Evaluation Engine Output ───

  @Column({ name: 'ai_score', type: 'smallint', nullable: true })
  aiScore?: number | null; // 0 to 100

  @Column({ name: 'ai_reasoning', type: 'text', nullable: true })
  aiReasoning?: string | null;

  @Column({
    name: 'ai_tier',
    type: 'enum',
    enum: AiScreeningTier,
    nullable: true,
  })
  aiTier?: AiScreeningTier | null;

  @Column({ name: 'internal_hr_notes', type: 'text', nullable: true })
  internalHrNotes?: string | null;

  @OneToMany(
    () => ApplicationSubmission,
    (submission) => submission.application,
  )
  submissions?: ApplicationSubmission[];

  // @CreateDateColumn()
  // appliedAt!: Date;
}
