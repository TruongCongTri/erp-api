// src/resources/dto/create-system-resource.dto.ts
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsBoolean,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { PermissionAction } from 'src/permissions/enums/permission-action.enum';
import { PermissionScope } from 'src/permissions/enums/permission-scope.enum';

class ResourcePermissionDto {
  @IsNotEmpty()
  action!: PermissionAction;

  @IsNotEmpty()
  scope!: PermissionScope;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSystemResourceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Slug can only contain lowercase letters, numbers, and underscores',
  })
  slug!: string; // e.g., 'invoice'

  @IsString()
  @IsNotEmpty()
  name!: string; // e.g., 'Hóa đơn'

  @IsString()
  @IsOptional()
  description?: string;

  // Added to support "Quick Create" flow from dropdowns
  @IsBoolean()
  @IsOptional()
  isLive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResourcePermissionDto)
  permissions?: ResourcePermissionDto[];
}
