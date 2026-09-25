import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CandidateIdentityDto } from './candidate-submission.dto';

// DTO cho ứng tuyển công khai theo Job ID (kể cả job đã hết hạn)
export class PublicJobSubmissionDto extends CandidateIdentityDto {
  @IsUUID('4', { message: 'jobPostId phải là định dạng UUID' })
  @IsNotEmpty({ message: 'Mã tin tuyển dụng không được để trống' })
  jobPostId!: string;

  @IsOptional()
  @IsString()
  cvUrl?: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverLetter?: string;
}

// DTO cho ứng tuyển tự do (không có jobPostId, chỉ có vị trí mong muốn)
export class SpontaneousSubmissionDto extends CandidateIdentityDto {
  @IsString({ message: 'Vị trí mong muốn phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập vị trí bạn mong muốn ứng tuyển' })
  @MaxLength(150, { message: 'Tên vị trí tối đa 150 ký tự' })
  desiredJobTitle!: string;

  @IsOptional()
  @IsString()
  cvUrl?: string;

  @IsOptional()
  @IsString()
  cvFileKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverLetter?: string;
}
