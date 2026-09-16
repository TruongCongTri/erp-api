import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { TicketCategory, TicketPriority } from '../ticket.types';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority = TicketPriority.NORMAL;

  @IsString()
  @IsNotEmpty()
  targetDepartmentId!: string; // Destination department queue

  @IsOptional()
  @IsUUID()
  assigneeId?: string; // Optional direct assignment; defaults to department pool if omitted

  // ─── ERP Polymorphic Binding ───

  @IsOptional()
  @IsString()
  targetEntityType?: string; // e.g., "bim_model", "purchase_order", "leave_request"

  @IsOptional()
  @IsString()
  targetEntityId?: string; // e.g., "po-2026-0091"

  @IsOptional()
  @IsString()
  targetProjectId?: string; // EPC project context: "PRJ-METRO-01"

  // ─── Submission State ───

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean = false; // If true, saved as DRAFT; otherwise SUBMITTED
}
