// src/permissions/dto/create-permission.dto.ts
import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { PermissionAction } from 'src/permissions/enums/permission-action.enum';
import { PermissionScope } from 'src/permissions/enums/permission-scope.enum';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  resourceId!: string; // e.g., 'contract', 'finance', 'asset'

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsEnum(PermissionScope)
  scope!: PermissionScope;

  @IsString()
  @IsNotEmpty()
  name!: string; // e.g., 'Sales', 'Finance' (For UI grouping)

  @IsString()
  @IsOptional()
  description?: string;
}
