// src/permissions/entities/permission.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/users.entity';
import { SystemResource } from 'src/resources/entities/system-resource.entity';

import { PermissionScope } from 'src/permissions/enums/permission-scope.enum';
import { PermissionAction } from 'src/permissions/enums/permission-action.enum';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('permissions')
export class Permission extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string; // e.g., 'finance:create:own'

  @Column()
  name!: string; // e.g., 'Quyền xem hóa đơn cá nhân'

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: PermissionAction })
  action!: PermissionAction;

  @Column({ type: 'enum', enum: PermissionScope })
  scope!: PermissionScope;

  @Column({ default: false })
  isDefault!: boolean;

  @Column({ default: false, name: 'is_live' })
  isLive!: boolean;

  @ManyToOne(() => SystemResource, (resource) => resource.permissions, {
    eager: true,
  })
  @JoinColumn({ name: 'resource_id' })
  resource!: SystemResource; // 'finance' -> Group for the UI checkbox

  @ManyToMany(() => Role, (role: Role) => role.permissions)
  roles!: Role[];

  @ManyToMany(() => User, (user: User) => user.bonusPermissions)
  users!: User[];
}
