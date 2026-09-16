import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsUrl,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  PlatformSource,
  ApplicationPhase,
  AiScreeningTier,
} from '../enums/ats.enum';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';

export class IngestCandidateSubmissionDto {
  @IsUUID('4')
  @IsNotEmpty()
  jobPostId!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsUrl()
  @IsNotEmpty()
  cvUrl!: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsEnum(PlatformSource)
  platformSource!: PlatformSource;

  @IsOptional()
  @IsString()
  externalApplicationId?: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;

  @IsOptional()
  @IsUrl()
  linkedInUrl?: string;
}

export class UpdateApplicationPhaseDto {
  @IsEnum(ApplicationPhase)
  phase!: ApplicationPhase;

  @IsOptional()
  @IsString()
  internalHrNotes?: string;
}

export class RecordAiScreeningResultDto {
  @IsInt()
  @Min(0)
  @Max(100)
  aiScore!: number;

  @IsString()
  @IsNotEmpty()
  aiReasoning!: string;

  @IsEnum(AiScreeningTier)
  aiTier!: AiScreeningTier;
}

export class QueryJobApplicationDto extends BaseQueryDto {
  @IsUUID('4')
  @IsNotEmpty()
  jobPostId!: string;

  @IsOptional()
  @IsEnum(ApplicationPhase)
  phase?: ApplicationPhase;

  @IsOptional()
  @IsEnum(AiScreeningTier)
  aiTier?: AiScreeningTier;

  @IsOptional()
  @IsInt()
  @Min(0)
  minScore?: number;
}
