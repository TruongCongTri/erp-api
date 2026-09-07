// src/users/entities/employee-profile.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { CitizenIdentityCard } from 'src/identity/entities/citizen-identity.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';

@Entity('employee_profiles')
export class EmployeeProfile extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, name: 'employee_code' })
  employeeCode!: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth!: Date;

  @Column({ length: 10 })
  gender!: string;

  // --- Identity & Tax Data ---
  @Column({ name: 'tax_code', nullable: true })
  taxCode?: string;

  @Column({ name: 'social_insurance_number', nullable: true })
  socialInsuranceNumber?: string;

  @OneToOne(() => CitizenIdentityCard, { cascade: true })
  @JoinColumn({ name: 'identity_card_id' })
  identityCard!: CitizenIdentityCard;

  // --- Contact & Employment ---
  @Column({ name: 'phone_number', length: 15 })
  phoneNumber!: string;

  @Column({ name: 'permanent_address', type: 'text' })
  permanentAddress!: string;

  @Column({ name: 'temporary_address', type: 'text', nullable: true })
  temporaryAddress?: string;

  @Column({ type: 'date', name: 'join_date' })
  joinDate!: Date;

  @Column({ name: 'job_title' })
  jobTitle!: string;

  @Column({ name: 'department', nullable: true })
  department?: string;

  @Column({ name: 'is_live', default: true })
  isLive!: boolean;

  // ==========================================
  // PRE-ASSIGNED ACCESS (Awaiting Claim)
  // ==========================================
  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: 'designated_role_id' })
  designatedRole?: Role; // 👈 HR assigns this during seeding

  @ManyToMany(() => Permission)
  @JoinTable({ name: 'employee_designated_permissions' })
  designatedBonusPermissions?: Permission[]; // HR assigns this during seeding

  // ==========================================
  // RELATIONAL LINK TO AUTH
  // ==========================================
  // Made User optional (?) and explicitly nullable so the profile can exist alone
  @OneToOne(() => User, (user) => user.profile, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;
}
