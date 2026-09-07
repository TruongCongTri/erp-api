// src/resources/dto/update-system-resource.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateSystemResourceDto } from './create-system-resource.dto';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateSystemResourceDto extends PartialType(
  CreateSystemResourceDto,
) {
  @IsBoolean()
  @IsOptional()
  isLive?: boolean;

  @IsArray()
  @IsOptional()
  @IsUUID('all', { each: true, message: 'ID quyền không hợp lệ' })
  permissionIds?: string[];
}
