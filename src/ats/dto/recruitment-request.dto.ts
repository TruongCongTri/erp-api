import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  MaxLength,
  ValidateIf,
  IsDateString,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import { RecruitmentRequestStatus } from '../enums/ats.enum';

export class CreateRecruitmentRequestDto {
  @IsString()
  @IsNotEmpty({
    message: 'Nội dung mô tả nhu cầu tuyển dụng không được để trống',
  })
  rawRequestNote!: string; // 1-textarea submission from Department Head

  @IsOptional()
  @IsUUID('4', {
    message: 'Mã phòng ban (departmentId) phải là định dạng UUID',
  })
  departmentId?: string; // Inferred from JWT if omitted
}

export class UpdateRecruitmentRequestDto {
  @IsString()
  @IsNotEmpty({
    message: 'Nội dung mô tả nhu cầu tuyển dụng không được để trống',
  })
  rawRequestNote!: string;
}

export class ReviewRecruitmentRequestDto {
  @IsEnum(RecruitmentRequestStatus, {
    message: 'Trạng thái xét duyệt phải là APPROVED hoặc REJECTED',
  })
  status!:
    RecruitmentRequestStatus.APPROVED | RecruitmentRequestStatus.REJECTED;

  @ValidateIf(
    (o: ReviewRecruitmentRequestDto) =>
      o.status === RecruitmentRequestStatus.REJECTED,
  )
  @IsNotEmpty({
    message: 'Bắt buộc nhập lý do từ chối khi chuyển sang trạng thái REJECTED',
  })
  @IsString()
  @MaxLength(500, { message: 'Lý do từ chối không được vượt quá 500 ký tự' })
  rejectionReason?: string;
}

export class QueryRecruitmentRequestDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(RecruitmentRequestStatus)
  status?: RecruitmentRequestStatus;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  requesterId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
