import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from '../../common/dto/base-query.dto';
import { toArray } from '../../common/transformers/to-array.transformer';
import { TicketCategory, TicketPriority, TicketStatus } from '../ticket.types';

export const TICKET_SORT_FIELDS = [
  'createdAt',
  'priority',
  'ticketCode',
  'status',
  'responseDueAt',
  'resolutionDueAt',
] as const;

export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

export class QueryTicketDto extends BaseQueryDto {
  // ─── Classification & Status ───

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<TicketCategory>(value))
  @IsArray()
  @IsEnum(TicketCategory, { each: true })
  category?: TicketCategory[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<TicketCategory>(value))
  @IsArray()
  @IsEnum(TicketPriority, { each: true })
  priority?: TicketPriority[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<TicketCategory>(value))
  @IsArray()
  @IsEnum(TicketStatus, { each: true })
  status?: TicketStatus[];

  // ─── Department Queue & Routing ───

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<TicketCategory>(value))
  @IsArray()
  @IsString({ each: true })
  targetDepartmentId?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray<TicketCategory>(value))
  @IsArray()
  @IsString({ each: true })
  requesterDepartmentId?: string[];

  // ─── People & Assignment ───

  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  isUnassigned?: boolean; // Toggles department triage queue (assigneeId IS NULL)

  // ─── Project & Polymorphic References ───

  @IsOptional()
  @IsString()
  targetProjectId?: string;

  @IsOptional()
  @IsString()
  targetEntityType?: string;

  @IsOptional()
  @IsString()
  targetEntityId?: string;

  // ─── SLA & Timeframe ───

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  isSlaBreached?: boolean;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  // ─── Sort Overrides ───

  @IsOptional()
  @IsIn(TICKET_SORT_FIELDS)
  override sortBy?: TicketSortField = 'createdAt';
}
