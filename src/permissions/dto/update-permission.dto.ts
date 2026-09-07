// src/permissions/dto/update-permission.dto.ts
import { IsString, IsOptional, IsBoolean } from 'class-validator';

// We do NOT use PartialType(CreatePermissionDto) here because we
// strictly forbid changing the resource, action, or scope after creation.
export class UpdatePermissionDto {
  @IsString()
  @IsOptional()
  resourceId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isLive?: boolean;
}
