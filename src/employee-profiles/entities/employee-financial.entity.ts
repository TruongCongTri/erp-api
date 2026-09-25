import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { EmployeeProfile } from './employee-profile.entity';

@Entity('employee_financials')
export class EmployeeFinancial extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_employee_financials_profile_id', { unique: true })
  @Column({ name: 'profile_id', type: 'uuid', unique: true })
  profileId!: string;

  @OneToOne(() => EmployeeProfile, (profile) => profile.financial, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile!: EmployeeProfile;

  // Mã số thuế cá nhân (Mã hóa AES-256-GCM)
  @Column({ name: 'tax_code_encrypted', type: 'text', nullable: true })
  taxCodeEncrypted?: string | null;

  // Mã số bảo hiểm xã hội (Mã hóa AES-256-GCM)
  @Column({
    name: 'social_insurance_number_encrypted',
    type: 'text',
    nullable: true,
  })
  socialInsuranceNumberEncrypted?: string | null;
}
