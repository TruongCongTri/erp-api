import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  MinLength,
  Min,
  IsPositive,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  JobLevel,
  JobType,
  WorkingModel,
  EducationLevel,
  CandidateGender,
} from '../enums/ats.enum';

export class WorkLocationDto {
  @IsString()
  label!: string;

  @IsString()
  address!: string;
}

export class AiGeneratedJdDto {
  @IsString()
  @MinLength(2)
  publicTitle!: string;

  @IsString()
  @IsOptional()
  specialization: string = '';

  @IsString()
  @IsOptional()
  domainKnowledge: string = '';

  @IsEnum(JobLevel)
  level!: JobLevel;

  @IsEnum(JobType)
  jobType!: JobType;

  @IsEnum(WorkingModel)
  workingModel!: WorkingModel;

  @IsNumber()
  @Min(0)
  salaryMin!: number;

  @IsNumber()
  @Min(0)
  salaryMax!: number;

  @IsBoolean()
  @IsOptional()
  isSalaryNegotiable: boolean = false;

  @IsString()
  jobDescription!: string;

  @IsString()
  requirements!: string;

  @IsString()
  benefits!: string;

  @IsString()
  @IsOptional()
  extraBenefits: string = '';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkLocationDto)
  @IsOptional()
  workLocations: WorkLocationDto[] = [];

  @IsString()
  @IsOptional()
  workingHoursStandard: string = 'Giờ hành chính';

  @IsString()
  @IsOptional()
  workingHoursDetail: string = '';

  @IsEnum(EducationLevel)
  minEducation!: EducationLevel;

  @IsNumber()
  @Min(0)
  @IsOptional()
  experienceYears: number = 0;

  @IsEnum(CandidateGender)
  @IsOptional()
  gender: CandidateGender = CandidateGender.ANY;

  @IsNumber()
  @IsOptional()
  ageMin?: number | null = null;

  @IsNumber()
  @IsOptional()
  ageMax?: number | null = null;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  mustHaveSkills!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  niceToHaveSkills!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  languages!: string[];

  @IsNumber()
  @IsPositive()
  @IsOptional()
  headcount: number = 1;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  suggestedDeadlineDays: number = 30;
}
