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
  Index,
  OneToMany,
} from 'typeorm';
import { CitizenIdentityCard } from 'src/identity/entities/citizen-identity.entity';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';
import { Department } from 'src/departments/entities/department.entity';
import { EmployeeSalaryHistory } from './employee-salary-history.entity';
import { EmployeeFinancial } from './employee-financial.entity';

@Entity('employee_profiles')
// 1. Composite Index phục vụ lọc trạng thái và phòng ban
@Index('idx_employee_profiles_live_dept', ['isLive', 'designatedDepartmentId'])
// 2. Index phục vụ sắp xếp theo ngày vào làm
@Index('idx_employee_profiles_join_date', ['joinDate'])
export class EmployeeProfile extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, name: 'employee_code', length: 32 })
  employeeCode!: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  dateOfBirth!: Date;

  @Column({ length: 10 })
  gender!: string;

  // --- Identity & Tax Data ---
  // @Column({ name: 'tax_code', nullable: true })
  // taxCode?: string;

  // @Column({ name: 'social_insurance_number', nullable: true })
  // socialInsuranceNumber?: string;

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

  // --- Pre-assigned Access ---
  @Index('idx_employee_profiles_desig_dept')
  @Column({ name: 'designated_department_id', type: 'uuid', nullable: true })
  designatedDepartmentId?: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'designated_department_id' })
  designatedDepartment?: Department | null;

  @Index('idx_employee_profiles_desig_role')
  @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'designated_role_id' })
  designatedRole?: Role; // HR assigns this during seeding

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'employee_designated_permissions',
    joinColumn: { name: 'profile_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  designatedBonusPermissions?: Permission[]; // HR assigns this during seeding

  // --- Relational Link to Auth User ---
  // Made User optional (?) and explicitly nullable so the profile can exist alone
  @Index('idx_employee_profiles_user_id', { unique: true })
  @OneToOne(() => User, (user) => user.profile, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  // --- Financial & Salary Sub-modules ---
  @OneToOne(() => EmployeeFinancial, (fin) => fin.profile, { cascade: true })
  financial?: EmployeeFinancial;

  @OneToMany(() => EmployeeSalaryHistory, (salary) => salary.profile, {
    cascade: true,
  })
  salaryHistories?: EmployeeSalaryHistory[];

  // --- Citizen Identity (CCCD) ---
  @OneToOne(() => CitizenIdentityCard, { cascade: true })
  @JoinColumn({ name: 'identity_card_id' })
  identityCard!: CitizenIdentityCard;
}
