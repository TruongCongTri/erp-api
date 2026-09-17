import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { FacebookAccountStatus } from '../enums/publishing-automation.enum';
import { ManagedFacebookGroup } from './managed-facebook-group.entity';

@Entity('facebook_accounts')
export class FacebookAccount extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_name', type: 'varchar', length: 150 })
  accountName!: string;

  @Column({
    name: 'account_identifier',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  accountIdentifier!: string;

  // AES-256-GCM encrypted JSON string of the session cookies (iv:authTag:ciphertext)
  @Column({ name: 'cookies_encrypted', type: 'text' })
  cookiesEncrypted!: string;

  @Column({ name: 'proxy_url', type: 'varchar', length: 255, nullable: true })
  proxyUrl?: string | null;

  @Column({ name: 'daily_post_limit', type: 'int', default: 5 })
  dailyPostLimit!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    type: 'enum',
    enum: FacebookAccountStatus,
    default: FacebookAccountStatus.HEALTHY,
  })
  status!: FacebookAccountStatus;

  @OneToMany(() => ManagedFacebookGroup, (group) => group.assignedAccount)
  groups?: ManagedFacebookGroup[];
}
