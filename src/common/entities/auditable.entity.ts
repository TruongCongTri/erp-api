import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class AuditableEntity {
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Records the ID of the user who originally created the record
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy?: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'created_by_name',
    nullable: true,
  })
  createdByName?: string;

  // Records the ID of the user who last modified the record
  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy?: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'updated_by_name',
    nullable: true,
  })
  updatedByName?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'deleted_by_name',
    nullable: true,
  })
  deletedByName?: string | null;
}
