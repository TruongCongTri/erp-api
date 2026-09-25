import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { User } from 'src/users/entities/users.entity';

@Entity('user_avatars')
// 1. Composite Index phục vụ truy vấn tìm avatar hiện tại của user
@Index('idx_user_avatars_user_current', ['user', 'isCurrent'])
// 2. Composite Index phục vụ sắp xếp lấy 5 ảnh gần nhất & tìm ảnh cũ nhất
@Index('idx_user_avatars_user_created', ['user', 'createdAt'])
export class UserAvatar extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'image_url', length: 1000 })
  imageUrl!: string;

  // Lưu S3 Key để xóa tệp chính xác trên S3 Bucket (ví dụ: avatars/2026/userId/uuid.webp)
  @Column({ name: 's3_key', length: 500 })
  s3Key!: string;

  @Column({ name: 'is_current', default: false })
  isCurrent!: boolean;

  @Index('idx_user_avatars_user_id')
  @ManyToOne(() => User, (user) => user.avatars, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
