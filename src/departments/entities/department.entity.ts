import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { User } from 'src/users/entities/users.entity';

@Entity('departments')
// 1. Composite Index phục vụ lọc theo tổ chức và trạng thái hoạt động (kết hợp soft-delete)
@Index('idx_departments_org_active_deleted', [
  'organizationId',
  'isActive',
  'deletedAt',
])
// 2. Index phục vụ sắp xếp ORDER BY name và tìm kiếm
@Index('idx_departments_name', ['name'])
export class Department extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Cột unique tự sinh Unique B-Tree Index (loại bỏ khai báo thừa ở class decorator)
  @Column({ length: 64, unique: true })
  slug!: string; // e.g., 'hr', 'mep', 'construction', 'finance'

  @Column({ name: 'code', length: 32, unique: true })
  code!: string; // e.g., 'DEPT-HR', 'DEPT-MEP'

  @Column({ name: 'name', length: 150 })
  name!: string; // e.g., 'Hành chính Nhân sự', 'Cơ điện (MEP)'

  @Index('idx_departments_org_id')
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  // ─── Trưởng bộ phận (Dùng để auto-assign ticket / duyệt đơn) ───
  @Index('idx_departments_head_user_id')
  @Column({ name: 'head_user_id', type: 'uuid', nullable: true })
  headUserId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'head_user_id' })
  headUser?: User | null;

  // ─── Phân cấp phòng ban (Cây thư mục) ───
  @Index('idx_departments_parent_id')
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId?: string | null;

  @ManyToOne(() => Department, (dept) => dept.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent?: Department | null;

  @OneToMany(() => Department, (dept) => dept.parent)
  children?: Department[];

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  // ─── Quan hệ ngược lại ───
  @OneToMany(() => User, (user) => user.department)
  users?: User[];

  @OneToMany(() => EmployeeProfile, (profile) => profile.designatedDepartment)
  profiles?: EmployeeProfile[];
}
