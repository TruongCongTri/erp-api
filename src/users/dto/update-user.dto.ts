// src/users/dto/update-user.dto.ts
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';
import { UpdateEmployeeProfileDto } from 'src/employee-profiles/dto/update-employee-profile.dto';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
export class UpdateUserDto extends PartialType(
  // Prevent updating core auth credentials and omit the original profile property
  OmitType(CreateUserDto, ['password', 'email', 'profile'] as const),
) {
  // Inject the new optional, partial profile DTO
  @ValidateNested()
  @Type(() => UpdateEmployeeProfileDto)
  @IsOptional()
  profile?: UpdateEmployeeProfileDto;
}
