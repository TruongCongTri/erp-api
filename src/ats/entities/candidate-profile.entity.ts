import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { JobApplication } from './job-application.entity';

@Entity('candidate_profiles')
@Index('idx_candidates_email', ['email'], { unique: true })
@Index('idx_candidates_phone', ['phoneNumber'])
export class CandidateProfile extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Column({ type: 'varchar', length: 150 })
  email!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 30 })
  phoneNumber!: string;

  @Column({
    name: 'linkedin_url',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  linkedInUrl?: string | null;

  @Column({
    name: 'portfolio_url',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  portfolioUrl?: string | null;

  @OneToMany(() => JobApplication, (application) => application.candidate)
  applications?: JobApplication[];
}
