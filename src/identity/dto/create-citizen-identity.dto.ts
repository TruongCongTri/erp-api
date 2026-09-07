import {
  IsString,
  IsNotEmpty,
  Length,
  IsEnum,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Gender } from '../enums/citizen-identity.enum'; // Ensure you have this enum

export class CreateCitizenIdentityDto {
  @IsString()
  @Length(12, 12, { message: 'Số CCCD phải bao gồm chính xác 12 chữ số' })
  cccdNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName!: string;

  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth!: string;

  @IsEnum(Gender, { message: 'Giới tính không hợp lệ' })
  gender!: Gender;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  ethnicity?: string;

  @IsString()
  @IsOptional()
  religion?: string;

  @IsString()
  @IsNotEmpty()
  placeOfOrigin!: string;

  @IsString()
  @IsNotEmpty()
  placeOfResidence!: string;

  @IsString()
  @IsOptional()
  temporaryAddress?: string;

  @IsString()
  @IsOptional()
  personalIdentification?: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfIssue!: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfExpiry!: string;

  @IsString()
  @IsNotEmpty()
  placeOfIssue!: string;
}
