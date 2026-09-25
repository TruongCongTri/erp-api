// src/users/entities/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  OneToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { UserAvatar } from 'src/user-avatars/entities/user-avatar.entity';
import { Department } from 'src/departments/entities/department.entity';

@Entity('users')
// 1. Composite Index phục vụ truy vấn Auth & Active Users (loại bỏ soft-deleted)
@Index('idx_users_status_deleted', ['status', 'deletedAt'])
// 2. Composite Index phục vụ lọc user theo sơ đồ tổ chức
@Index('idx_users_org_dept', ['organizationId', 'departmentId'])
// 3. Index phục vụ tìm kiếm và sắp xếp theo tên
@Index('idx_users_full_name', ['fullName'])
export class User extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Cột unique tự động sinh B-Tree index phục vụ Auth
  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ name: 'avatar_url', nullable: true, length: 500 })
  avatarUrl?: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  // ─── Tổ chức & Phòng ban vận hành trực tiếp ───
  @Index('idx_users_org_id')
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Index('idx_users_department_id')
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @ManyToOne(() => Department, (dept) => dept.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  // --- Active Session Access ---
  @Index('idx_users_role_id')
  @ManyToOne(() => Role, (role: Role) => role.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'role_id' })
  role?: Role | null;

  @ManyToMany(() => Permission, (permission: Permission) => permission.users)
  @JoinTable({
    name: 'user_bonus_permissions',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  bonusPermissions?: Permission[];

  // --- Profile Link ---
  @OneToOne(() => EmployeeProfile, (profile: EmployeeProfile) => profile.user, {
    cascade: true,
  })
  profile?: EmployeeProfile;

  @OneToMany(() => UserAvatar, (avatar: UserAvatar) => avatar.user, {
    cascade: true,
  })
  avatars?: UserAvatar[];
}
