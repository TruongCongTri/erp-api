// src/users/dto/create-employee-profile.dto.ts
import { IsString, IsOptional, IsDateString } from 'class-validator';
import { IsVnPhone } from '../../common/decorators/is-vn-phone.decorator';
import { Transform } from 'class-transformer';
import { formatToE164 } from '../../common/utils/phone.util';

export class CreateEmployeeProfileDto {
  @IsString()
  employeeCode!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  gender!: string;

  @IsString()
  cccdNumber!: string;

  @IsDateString()
  @IsOptional()
  cccdIssueDate?: string;

  @IsString()
  @IsOptional()
  cccdIssuePlace?: string;

  @IsString()
  @IsOptional()
  taxCode?: string;

  @IsString()
  @IsOptional()
  socialInsuranceNumber?: string;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? formatToE164(value)
      : (value as string | undefined),
  ) // Transforms to +84 automatically
  @IsVnPhone()
  phoneNumber!: string;

  @IsString()
  permanentAddress!: string;

  @IsString()
  @IsOptional()
  temporaryAddress?: string;

  @IsDateString()
  joinDate!: string;

  @IsString()
  jobTitle!: string;
}
