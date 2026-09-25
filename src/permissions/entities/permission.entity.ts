// src/permissions/entities/permission.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/users.entity';
import { SystemResource } from 'src/resources/entities/system-resource.entity';

import { PermissionScope } from 'src/permissions/enums/permission-scope.enum';
import { PermissionAction } from 'src/permissions/enums/permission-action.enum';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('permissions')
// Composite index hỗ trợ lọc quyền theo resource và trạng thái kích hoạt (bỏ qua soft-deleted)
@Index('idx_permissions_resource_live', ['resource', 'isLive'])
// Index tối ưu tìm kiếm theo tên quyền
@Index('idx_permissions_name', ['name'])
export class Permission extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Đã có Unique B-Tree Index tự động từ thuộc tính unique: true
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

  // ĐÃ BỎ { eager: true }: Chỉ join khi cần thiết để tránh ép mọi query phải nạp resource
  @ManyToOne(() => SystemResource, (resource) => resource.permissions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'resource_id' })
  @Index('idx_permissions_resource_id') // Khóa ngoại cần có B-Tree index riêng
  resource!: SystemResource;

  @ManyToMany(() => Role, (role: Role) => role.permissions)
  roles!: Role[];

  @ManyToMany(() => User, (user: User) => user.bonusPermissions)
  users!: User[];
}
