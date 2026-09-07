// src/resources/entities/system-resource.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Permission } from 'src/permissions/entities/permission.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('system_resources')
export class SystemResource extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
