import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiffChangeType } from '../audit-log.types';

export class AuditDiffFieldDto {
  @IsString()
  @IsNotEmpty()
  field!: string; // e.g., "status"

  @IsString()
  @IsNotEmpty()
  label!: string; // e.g., "Trạng thái"

  @IsOptional()
  oldValue?: unknown; // Redundant union removed; unknown permits null, primitives, objects

  @IsOptional()
  newValue?: unknown;

  @IsOptional()
  @IsString()
  oldDisplay?: string | null; // e.g., "Chờ duyệt"

  @IsOptional()
  @IsString()
  newDisplay?: string | null; // e.g., "Đã duyệt"

  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;
}

export class AuditDiffPayloadDto {
  @IsEnum(DiffChangeType)
  changeType!: DiffChangeType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditDiffFieldDto)
  fields!: AuditDiffFieldDto[];
}
