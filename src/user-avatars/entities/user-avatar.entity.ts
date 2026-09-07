import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { User } from 'src/users/entities/users.entity';

@Entity('user_avatars')
export class UserAvatar extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'image_url' })
  imageUrl!: string;

  @Column({ name: 'is_current', default: false })
  isCurrent!: boolean;

  @ManyToOne(() => User, (user) => user.avatars, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
