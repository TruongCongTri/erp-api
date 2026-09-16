import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import {
  ActorRoleLevel,
  AuditActionType,
  AuditStatus,
} from '../audit-log.types';
import { toArray } from 'src/common/transformers/to-array.transformer';

export const AUDIT_SORT_FIELDS = [
  'timestamp',
  'trackingCode',
  'status',
  'actionType',
] as const;

export type AuditSortField = (typeof AUDIT_SORT_FIELDS)[number];

export class QueryAuditLogDto extends BaseQueryDto {
  // ─── Free-Text Search & Identifiers ───
  // Note: `search`, `sortOrder`, `page`, `limit`, and `cursor` are inherited from BaseQueryDto
  @IsOptional()
  @IsString()
  trackingCode?: string; // e.g., "#appr-004", "#req-001"

  @IsOptional()
  @IsString()
  correlationId?: string;

  // ─── Actor Scope ───

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorDepartmentId?: string;

  @IsOptional()
  @IsEnum(ActorRoleLevel)
  actorRoleLevel?: ActorRoleLevel;

  // ─── Target Resource & Department Scope ───

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<string>(value))
  @IsArray()
  @IsString({ each: true })
  targetDepartmentId?: string[];

  @IsOptional()
  @IsString()
  resourceSlug?: string; // e.g., "leave_request", "ats_jobs"

  @IsOptional()
  @IsString()
  targetEntityId?: string;

  @IsOptional()
  @IsString()
  targetProjectId?: string; // EPC project reference (e.g., "PRJ-METRO-01")

  // ─── Action & Status Filters ───

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<AuditActionType>(value))
  @IsArray()
  @IsEnum(AuditActionType, { each: true })
  actionType?: AuditActionType[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<AuditStatus>(value))
  @IsArray()
  @IsEnum(AuditStatus, { each: true })
  status?: AuditStatus[];

  // ─── Timeframe (Partition Key Filtering) ───

  @IsOptional()
  @IsDateString()
  fromDate?: string; // ISO 8601

  @IsOptional()
  @IsDateString()
  toDate?: string; // ISO 8601

  // ─── Sort Field Override ───

  @IsOptional()
  @IsIn(AUDIT_SORT_FIELDS)
  override sortBy?: AuditSortField = 'timestamp';
}
