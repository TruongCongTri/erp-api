import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsUrl,
  IsEnum,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import { ApplicationPhase, PlatformSource } from '../enums/ats.enum';

// ── Profile Identity Core ──
export class CandidateIdentityDto {
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên ứng viên không được để trống' })
  @MaxLength(150)
  fullName!: string;

  @IsEmail({}, { message: 'Định dạng email ứng viên không hợp lệ' })
  @MaxLength(150)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại liên hệ không được để trống' })
  @Matches(/^[0-9+]{8,15}$/, {
    message: 'Số điện thoại không đúng định dạng chuẩn',
  })
  phoneNumber!: string;

  @IsOptional()
  @IsUrl({}, { message: 'Đường dẫn LinkedIn không hợp lệ' })
  linkedInUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Đường dẫn Portfolio/GitHub không hợp lệ' })
  portfolioUrl?: string;
}

// ── Unified Omnichannel Submission Ingestion ──
export class IngestCandidateSubmissionDto extends CandidateIdentityDto {
  @IsUUID('4', { message: 'jobPostId phải là định dạng UUID' })
  @IsNotEmpty()
  jobPostId!: string;

  @IsOptional()
  @IsString()
  cvUrl?: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsEnum(PlatformSource, { message: 'Nguồn tiếp nhận hồ sơ không hợp lệ' })
  platformSource!: PlatformSource;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalApplicationId?: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;

  @IsOptional()
  @IsString()
  internalHrNotes?: string;
}

// ── Portal Submission (Candidate Self-Apply) ──
export class PortalCandidateSubmissionDto extends CandidateIdentityDto {
  @IsUUID('4')
  @IsNotEmpty()
  jobPostId!: string;

  @IsUrl()
  @IsNotEmpty()
  cvUrl!: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;
}

// ── Manual Submission (HR Intake via Zalo, FB, Referral) ──
export class ManualCandidateSubmissionDto extends CandidateIdentityDto {
  @IsUUID('4', { message: 'jobPostId phải là định dạng UUID' })
  @IsNotEmpty()
  jobPostId!: string;

  @IsOptional()
  @IsUrl({}, { message: 'cvUrl phải là một đường dẫn URL hợp lệ' })
  cvUrl?: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsEnum(PlatformSource)
  platformSource!:
    | PlatformSource.ZALO
    | PlatformSource.FACEBOOK
    | PlatformSource.REFERRAL
    | PlatformSource.MANUAL_ENTRY;

  @IsOptional()
  @IsString()
  coverLetter?: string;

  @IsOptional()
  @IsString()
  internalHrNotes?: string;
}

// ── Workflow Phase Update ──
export class UpdateApplicationPhaseDto {
  @IsEnum(ApplicationPhase, { message: 'Giai đoạn tuyển dụng không hợp lệ' })
  phase!: ApplicationPhase;

  @IsOptional()
  @IsString()
  internalHrNotes?: string;
}

// DTO chuyên dụng cho Client upload file (không yêu cầu cvUrl từ client)
export class UploadCandidateSubmissionDto extends CandidateIdentityDto {
  @IsUUID('4')
  @IsNotEmpty()
  jobPostId!: string;

  @IsEnum(PlatformSource, { message: 'Nguồn tiếp nhận không hợp lệ' })
  platformSource!: PlatformSource;

  @IsOptional()
  @IsString()
  coverLetter?: string;

  @IsOptional()
  @IsString()
  internalHrNotes?: string;
}

// ── Query Candidates in Job Pipeline ──
export class QueryJobApplicationsDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(ApplicationPhase)
  phase?: ApplicationPhase;

  @IsOptional()
  @IsString()
  declare search?: string;
}
