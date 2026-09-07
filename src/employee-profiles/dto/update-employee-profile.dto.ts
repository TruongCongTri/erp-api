// src/users/dto/update-employee-profile.dto.ts
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeProfileDto } from './create-employee-profile.dto';

// Omit 'employeeCode' to prevent it from being accidentally modified during HR updates
export class UpdateEmployeeProfileDto extends PartialType(
  OmitType(CreateEmployeeProfileDto, ['employeeCode'] as const),
) {}
