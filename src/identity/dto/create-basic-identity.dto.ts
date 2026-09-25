import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Gender } from '../enums/citizen-identity.enum';

export class CreateBasicIdentityDto {
  @IsNotEmpty({ message: 'Số CCCD không được để trống.' })
  @IsString()
  @Length(12, 12, { message: 'Số CCCD phải gồm đúng 12 chữ số.' })
  @Matches(/^[0-9]{12}$/, { message: 'Số CCCD chỉ được chứa ký tự số.' })
  cccdNumber!: string;

  @IsNotEmpty({ message: 'Họ và tên không được để trống.' })
  @IsString()
  fullName!: string;

  @IsNotEmpty({ message: 'Ngày sinh không được để trống.' })
  @IsString()
  dateOfBirth!: string;

  @IsNotEmpty({ message: 'Giới tính không được để trống.' })
  @IsEnum(Gender)
  gender!: Gender;

  @IsNotEmpty({ message: 'Nơi thường trú không được để trống.' })
  @IsString()
  placeOfResidence!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
