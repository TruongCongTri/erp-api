// src/roles/entities/role.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('roles')
export class Role extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string; // e.g., 'DGD_CONSTRUCTION'

  @Column()
  name!: string; // e.g., 'Phó Tổng Giám đốc Khối Thi công'

  @Column({ default: false })
  isDefault!: boolean; // General Director, etc. cannot be deleted

  @Column({ default: false, name: 'is_live' })
  isLive!: boolean;

  @ManyToMany(() => Permission, (permission: Permission) => permission.roles, {
    cascade: true,
  })
  @JoinTable({ name: 'role_permissions' })
  permissions!: Permission[];

  @OneToMany(() => User, (user: User) => user.role)
  users!: User[];
}
