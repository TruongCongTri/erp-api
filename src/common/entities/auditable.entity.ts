import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

export abstract class AuditableEntity {
  // 1. Đánh index phục vụ ORDER BY created_at DESC ở các API phân trang
  @Index()
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;

  // 2. Metadata Audit người tạo (Denormalized Snapshot để triệt tiêu JOIN users)
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'created_by_name',
    nullable: true,
  })
  createdByName?: string | null;

  // 3. Metadata Audit người cập nhật
  @Column({
    type: 'uuid',
    name: 'updated_by',
    nullable: true,
  })
  updatedBy?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'updated_by_name',
    nullable: true,
  })
  updatedByName?: string | null;

  // 4. Soft Delete Columns - Đặt select: false để tối ưu triệt để Network Payload và RAM Cache
  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
    select: false, // Ẩn khỏi câu SELECT mặc định
  })
  deletedAt?: Date | null;

  @Column({
    type: 'uuid',
    name: 'deleted_by',
    nullable: true,
    select: false, // Ẩn khỏi câu SELECT mặc định
  })
  deletedBy?: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'deleted_by_name',
    nullable: true,
    select: false, // Ẩn khỏi câu SELECT mặc định
  })
  deletedByName?: string | null;
}
