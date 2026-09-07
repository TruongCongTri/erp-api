// src/users/dto/create-user.dto.ts
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '../enums/user-status.enum';
import { CreateEmployeeProfileDto } from 'src/employee-profiles/dto/create-employee-profile.dto';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  fullName!: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  // The nested HR profile data
  @ValidateNested()
  @Type(() => CreateEmployeeProfileDto)
  profile!: CreateEmployeeProfileDto;
}
