import {
  IsOptional,
  IsBoolean,
  IsString,
  IsEnum,
  IsArray,
  IsIn,
  IsISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import {
  NotificationCategory,
  NotificationPriority,
  ActionState,
} from '../enums/notification.enum';

// Helper function để parse array từ query string (VD: ?category=TASK,ALERT hoặc ?category=TASK&category=ALERT)
const toArray = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') return value.split(',').map((v) => v.trim());
  if (Array.isArray(value)) return value as unknown[];
  return value;
};

// Helper function để parse boolean từ query string (VD: ?isRead=true hoặc ?isRead=1)
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === '1' || value === true) return true;
  if (value === 'false' || value === '0' || value === false) return false;
  return value;
};

export class NotificationQueryDto extends BaseQueryDto {
  // ==========================================
  // Inbox Tabs & Statuses
  // ==========================================
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isArchived?: boolean = false;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeExpired?: boolean = false;

  // ==========================================
  // Taxonomy & Multi-Dept Slicing
  // ==========================================
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  departmentId?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(NotificationCategory, { each: true })
  category?: NotificationCategory[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  taskType?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(NotificationPriority, { each: true })
  priority?: NotificationPriority[];

  // ==========================================
  // Interactive Action Workflow
  // ==========================================
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActionable?: boolean;

  @IsOptional()
  @IsEnum(ActionState)
  actionState?: ActionState;

  // ==========================================
  // Search & Time Range
  // ==========================================
  // `search` đã được kế thừa từ BaseQueryDto

  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;

  // ==========================================
  // Sorting & Pagination
  // ==========================================
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'priority', 'expiresAt', 'isRead'])
  sortBy?: 'createdAt' | 'priority' | 'expiresAt' | 'isRead' = 'createdAt';

  // `sortOrder`, `page`, `limit` đã được kế thừa từ BaseQueryDto

  @IsOptional()
  @IsString()
  declare cursor?: string; // Hỗ trợ cả chuẩn Cursor-based Pagination
}
