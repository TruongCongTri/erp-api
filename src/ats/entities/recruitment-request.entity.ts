import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { Department } from 'src/departments/entities/department.entity';
import { JobPost } from './job-post.entity';
import { RecruitmentRequestStatus } from '../enums/ats.enum';
import { User } from 'src/users/entities/users.entity';

@Entity('recruitment_requests')
// ── 1. Tối ưu Composite Index phục vụ lọc và phân trang (Tránh Sequential Scan) ──
@Index('idx_rec_req_status_created', ['status', 'createdAt'])
@Index('idx_rec_req_dept_created', ['departmentId', 'createdAt'])
@Index('idx_rec_req_dept_status', ['departmentId', 'status'])
@Index('idx_rec_req_requester_created', ['requesterId', 'createdAt'])
@Index('idx_rec_req_created_at', ['createdAt'])
export class RecruitmentRequest extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // requestCode đã có Unique Constraint (Postgres tự động tạo Unique B-tree Index)
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

  // ── 2. Đánh Index ngoại khóa (PostgreSQL mặc định KHÔNG index Foreign Keys) ──
  @Index('idx_rec_req_requester_id')
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @Index('idx_rec_req_department_id')
  @Column({ name: 'department_id', type: 'uuid' })
  departmentId!: string;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  @OneToOne(() => JobPost, (jobPost) => jobPost.recruitmentRequest)
  jobPost?: JobPost;
}
