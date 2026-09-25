// src/resources/entities/system-resource.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { Permission } from 'src/permissions/entities/permission.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('system_resources')
// Index kết hợp cho truy vấn tài nguyên khả dụng (bỏ qua bản ghi soft-deleted)
@Index('idx_system_resources_live_deleted', ['isLive', 'deletedAt'])
// Index phục vụ tìm kiếm và sắp xếp theo tên
@Index('idx_system_resources_name', ['name'])
export class SystemResource extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Cột unique đã tự sinh Unique B-Tree Index: idx_system_resources_slug
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string; // e.g., 'invoice'

  @Column({ type: 'varchar', length: 255 })
  name!: string; // e.g., 'Hóa đơn'

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: false, name: 'is_live' })
  isLive!: boolean;

  @OneToMany(() => Permission, (permission: Permission) => permission.resource)
  permissions!: Permission[];
}
