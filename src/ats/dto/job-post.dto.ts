import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  JobLevel,
  JobPostCreationMethod,
  JobType,
  WorkingModel,
  EducationLevel,
  CandidateGender,
  PlatformSource,
  JobPostStatus,
} from '../enums/ats.enum';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import { toArray } from 'src/common/transformers/to-array.transformer';
import { PartialType } from '@nestjs/mapped-types';

export class AiSuggestJdDto {
  @IsString()
  @IsNotEmpty({ message: 'Prompt mô tả công việc không được để trống' })
  rawPrompt!: string;

  @IsOptional()
  @IsUUID('4')
  recruitmentRequestId?: string;
}

export class WorkLocationDto {
  @IsOptional()
  @IsString()
  label?: string; // e.g. "Khu vực 1"

  @IsOptional()
  @IsString()
  address?: string; // e.g. "Đồng Nai, Phường Trấn Biên, C20, đường N4"
}

export class CreateJobPostDto {
  @IsOptional()
  @IsEnum(JobPostCreationMethod)
  creationMethod?: JobPostCreationMethod;

  @IsOptional()
  @IsUUID('4')
  recruitmentRequestId?: string;

  @IsOptional()
  @IsUUID('4')
  templateSourceId?: string; // Cloned JD reference

  // ─── 1. Thông tin chung ───
  @IsString()
  @IsNotEmpty()
  publicTitle!: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsString()
  domainKnowledge?: string;

  @IsOptional()
  @IsEnum(JobLevel)
  level?: JobLevel;

  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @IsEnum(WorkingModel)
  workingModel?: WorkingModel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsBoolean()
  isSalaryNegotiable?: boolean;

  // ─── 2. Mô tả công việc ───
  @IsOptional()
  @IsString()
  jobDescription?: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @IsString()
  benefits?: string;

  @IsOptional()
  @IsString()
  extraBenefits?: string;

  @IsOptional()
  @IsArray()
  workLocations?: any[];

  @IsOptional()
  @IsString()
  workingHoursStandard?: string;

  @IsOptional()
  @IsString()
  workingHoursDetail?: string;

  // ─── 3. Kỳ vọng về ứng viên ───
  @IsOptional()
  @IsEnum(EducationLevel)
  minEducation?: EducationLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsEnum(CandidateGender)
  gender?: CandidateGender;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(16)
  ageMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(80)
  ageMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustHaveSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  niceToHaveSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  // ─── 4. Thông tin nhận hồ sơ ───
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  @IsString()
  hrRecipientName?: string;

  @IsOptional()
  @IsString()
  hrRecipientPhone?: string;

  @IsOptional()
  @IsString()
  hrRecipientEmail?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  // ─── 5. Publishing Routing & Scheduling ───
  @IsOptional()
  @IsArray()
  @IsEnum(PlatformSource, { each: true })
  targetPlatforms?: PlatformSource[];

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsBoolean()
  requireHeadApproval?: boolean = false;
}

export class UpdateJobPostDto extends PartialType(CreateJobPostDto) {
  @IsOptional()
  @IsEnum(JobPostStatus)
  status?: JobPostStatus;
}

export class ReviewJobPostDto {
  @IsBoolean()
  isApproved!: boolean;

  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}

export class PublishJobPostDto {
  @IsArray()
  @IsEnum(PlatformSource, { each: true })
  targetPlatforms!: PlatformSource[];

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsBoolean()
  bypassHeadApproval?: boolean = true;
}

export class QueryJobPostDto extends BaseQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<JobPostStatus>(value))
  @IsArray()
  @IsEnum(JobPostStatus, { each: true })
  status?: JobPostStatus[];

  @IsOptional()
  @IsEnum(JobLevel)
  level?: JobLevel;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<PlatformSource>(value))
  @IsArray()
  @IsEnum(PlatformSource, { each: true })
  platform?: PlatformSource[];

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;
}
