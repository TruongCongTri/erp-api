import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from './employee-profile.entity';

@Entity('employee_salary_histories')
// 1. Composite Index phục vụ sắp xếp thời gian & lọc lịch sử lương theo nhân viên
@Index('idx_salary_history_profile_date', ['profileId', 'effectiveDate'])
// 2. Composite Index tìm nhanh mức lương đang áp dụng
@Index('idx_salary_history_profile_current', ['profileId', 'isCurrent'])
export class EmployeeSalaryHistory extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_salary_history_profile_id')
  @Column({ name: 'profile_id', type: 'uuid' })
  profileId!: string;

  @ManyToOne(() => EmployeeProfile, (profile) => profile.salaryHistories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile!: EmployeeProfile;

  // Lưu dạng mã hóa AES-256-GCM (Lương cơ bản đóng BHXH/hợp đồng)
  @Column({ name: 'base_salary_encrypted', type: 'text' })
  baseSalaryEncrypted!: string;

  // Lưu dạng mã hóa AES-256-GCM (Phụ cấp, trách nhiệm, dự án)
  @Column({ name: 'extra_salary_encrypted', type: 'text', default: '' })
  extraSalaryEncrypted!: string;

  @Column({ length: 10, default: 'VND' })
  currency!: string;

  @Column({ type: 'date', name: 'effective_date' })
  effectiveDate!: Date;

  @Column({ type: 'text', nullable: true })
  note?: string; // Lý do: Hết hạn thử việc, tăng lương định kỳ 2026, thăng chức Lead

  @Column({ name: 'is_current', default: false })
  isCurrent!: boolean;
}
