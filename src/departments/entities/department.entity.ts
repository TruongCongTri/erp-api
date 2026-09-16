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
@Index('idx_department_slug', ['slug'], { unique: true })
@Index('idx_department_code', ['code'], { unique: true })
@Index('idx_department_org', ['organizationId', 'isActive'])
@Index('idx_department_parent', ['parentId'])
export class Department extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  slug!: string; // e.g., 'hr', 'mep', 'construction', 'finance'

  @Column({ name: 'code', length: 32, unique: true })
  code!: string; // e.g., 'DEPT-HR', 'DEPT-MEP'

  @Column({ name: 'name', length: 150 })
  name!: string; // e.g., 'Hành chính Nhân sự', 'Cơ điện (MEP)'

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  // ─── Trưởng bộ phận (Dùng để auto-assign ticket / duyệt đơn) ───
  @Column({ name: 'head_user_id', type: 'uuid', nullable: true })
  headUserId?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'head_user_id' })
  headUser?: User | null;

  // ─── Phân cấp phòng ban (Cây thư mục) ───
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
