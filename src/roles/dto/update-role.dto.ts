// src/roles/dto/update-role.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @IsOptional()
  @IsArray({ message: 'Danh sách quyền phải là một mảng' })
  @IsUUID('all', { each: true, message: 'ID quyền không hợp lệ' })
  permissionIds?: string[];

  @IsBoolean()
  @IsOptional()
  isLive?: boolean;
}
