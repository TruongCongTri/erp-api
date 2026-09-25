import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToOne,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { Gender } from '../enums/citizen-identity.enum';

export enum IdentityCardStatus {
  DRAFT = 'DRAFT', // Mới nhập thủ công một số trường cơ bản
  VERIFIED = 'VERIFIED', // Đã quét QR hoặc đối soát đầy đủ thông tin
}

@Entity('citizen_identity_cards')
// Index kiểm tra thời hạn thẻ (Cảnh báo thẻ sắp hết hạn cho HR)
@Index('idx_citizen_identity_expiry', ['dateOfExpiry'])
export class CitizenIdentityCard extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 1. Blind Index: Lưu giá trị băm HMAC-SHA256 để tìm kiếm O(1) và ngăn chặn trùng lặp tuyệt đối
  @Index('idx_citizen_identity_cccd_hash', { unique: true })
  @Column({
    type: 'varchar',
    length: 64,
    unique: true,
    name: 'cccd_number_hash',
  })
  cccdNumberHash!: string;

  // 2. Dữ liệu số CCCD đã mã hóa AES-256-GCM (iv:authTag:ciphertext)
  @Column({ type: 'text', name: 'cccd_number_encrypted' })
  cccdNumberEncrypted!: string;

  // 3. 4 số cuối của CCCD phục vụ hiển thị an toàn trên giao diện mà không cần giải mã (Masked view)
  @Column({ type: 'varchar', length: 4, name: 'cccd_last_four' })
  cccdLastFour!: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth!: Date;

  @Column({ type: 'enum', enum: Gender, name: 'gender' })
  gender!: Gender;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'Việt Nam',
    name: 'nationality',
  })
  nationality!: string;

  @Column({ type: 'varchar', length: 100, name: 'ethnicity', nullable: true })
  ethnicity?: string;

  @Column({ type: 'varchar', length: 100, name: 'religion', nullable: true })
  religion?: string;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'place_of_origin',
    nullable: true,
  })
  placeOfOrigin?: string;

  @Column({ type: 'varchar', length: 500, name: 'place_of_residence' })
  placeOfResidence!: string;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'temporary_address',
    nullable: true,
  })
  temporaryAddress?: string;

  // Đặc điểm nhân dạng - Mã hóa AES-256-GCM bảo vệ sinh trắc học
  @Column({
    type: 'text',
    name: 'personal_identification_encrypted',
    nullable: true,
  })
  personalIdentificationEncrypted?: string | null;

  @Column({ type: 'date', name: 'date_of_issue', nullable: true })
  dateOfIssue?: Date;

  @Column({ type: 'date', name: 'date_of_expiry', nullable: true })
  dateOfExpiry?: Date;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'place_of_issue',
    nullable: true,
  })
  placeOfIssue?: string;

  // Chuỗi QR thô được mã hóa bảo mật
  @Column({ type: 'text', name: 'raw_qr_data_encrypted', nullable: true })
  rawQrDataEncrypted?: string | null;

  @Column({
    type: 'enum',
    enum: IdentityCardStatus,
    default: IdentityCardStatus.DRAFT,
    name: 'status',
  })
  status!: IdentityCardStatus;

  // Quan hệ 1-1 ngược về EmployeeProfile
  @OneToOne(() => EmployeeProfile, (profile) => profile.identityCard, {
    onDelete: 'CASCADE',
  })
  profile?: EmployeeProfile;
}
