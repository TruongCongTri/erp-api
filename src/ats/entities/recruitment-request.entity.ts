import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { Department } from 'src/departments/entities/department.entity';
import { JobPost } from './job-post.entity';
import { RecruitmentRequestStatus } from '../enums/ats.enum';
import { User } from 'src/users/entities/users.entity';

@Entity('recruitment_requests')
export class RecruitmentRequest extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_code', type: 'varchar', length: 32, unique: true })
  requestCode!: string; // e.g., "REQ-2026-0042"

  @Column({ name: 'raw_request_note', type: 'text' })
  rawRequestNote!: string; // Single-textarea prompt from the Department Head

  @Column({
    type: 'enum',
    enum: RecruitmentRequestStatus,
    default: RecruitmentRequestStatus.PENDING_HR,
  })
  status!: RecruitmentRequestStatus;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  @OneToOne(() => JobPost, (jobPost) => jobPost.recruitmentRequest)
  jobPost?: JobPost;
}
