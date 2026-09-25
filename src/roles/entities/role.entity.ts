// src/roles/entities/role.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  OneToMany,
  Index,
} from 'typeorm';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('roles')
// 1. Composite Index phục vụ lọc vai trò đang hoạt động (kết hợp soft-delete)
@Index('idx_roles_live_deleted', ['isLive', 'deletedAt'])
// 2. Index phục vụ tìm kiếm theo tên và sắp xếp
@Index('idx_roles_name', ['name'])
// 3. Index phục vụ defaultSort: 'updatedAt' của API danh sách
@Index('idx_roles_updated_at', ['updatedAt'])
export class Role extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string; // e.g., 'DGD_CONSTRUCTION'

  @Column()
  name!: string; // e.g., 'Phó Tổng Giám đốc Khối Thi công'

  @Column({ default: false, name: 'is_default' })
  isDefault!: boolean; // General Director, etc. cannot be deleted

  @Column({ default: false, name: 'is_live' })
  isLive!: boolean;

  @ManyToMany(() => Permission, (permission: Permission) => permission.roles)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions!: Permission[];

  @OneToMany(() => User, (user: User) => user.role)
  users!: User[];
}
