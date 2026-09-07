import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { Gender } from '../enums/citizen-identity.enum';
import { AuditableEntity } from 'src/common/entities/auditable.entity';

@Entity('citizen_identity_cards')
export class CitizenIdentityCard extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // The 12-digit national personal identification number
  @Column({ type: 'varchar', length: 12, unique: true, name: 'cccd_number' })
  @Index({ unique: true })
  cccdNumber!: string;

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

  // Quê quán / Nơi sinh gốc
  @Column({ type: 'varchar', length: 500, name: 'place_of_origin' })
  placeOfOrigin!: string;

  // Nơi thường trú
  @Column({ type: 'varchar', length: 500, name: 'place_of_residence' })
  placeOfResidence!: string;

  // Nơi tạm trú (Optional context)
  @Column({
    type: 'varchar',
    length: 500,
    name: 'temporary_address',
    nullable: true,
  })
  temporaryAddress?: string;

  // Features / Personal identification marks (Đặc điểm nhân dạng)
  @Column({ type: 'text', name: 'personal_identification', nullable: true })
  personalIdentification?: string;

  @Column({ type: 'date', name: 'date_of_issue' })
  dateOfIssue!: Date;

  @Column({ type: 'date', name: 'date_of_expiry' })
  dateOfExpiry!: Date;

  // Place of issue (e.g., Cục Cảnh sát Quản lý Hành chính về Trật tự Xã hội)
  @Column({ type: 'varchar', length: 255, name: 'place_of_issue' })
  placeOfIssue!: string;

  // Stores raw payload extracted from QR code/chip scans if needed
  @Column({ type: 'jsonb', name: 'raw_qr_data', nullable: true })
  rawQrData?: Record<string, any>;
}
