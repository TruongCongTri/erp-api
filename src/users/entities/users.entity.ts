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
} from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { UserAvatar } from 'src/user-avatars/entities/user-avatar.entity';
import { Department } from 'src/departments/entities/department.entity';

@Entity('users')
export class User extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ select: false })
  passwordHash!: string;

  @Column({ name: 'full_name' })
  fullName!: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  // ─── Tổ chức & Phòng ban vận hành trực tiếp ───
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @ManyToOne(() => Department, (dept) => dept.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  // --- Active Session Access ---
  @ManyToOne(() => Role, (role: Role) => role.users, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  role?: Role;

  @ManyToMany(() => Permission, (permission: Permission) => permission.users)
  @JoinTable({ name: 'user_bonus_permissions' })
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
