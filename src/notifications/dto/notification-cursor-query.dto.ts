import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class NotificationCursorQueryDto {
  @IsOptional()
  @Type(() => Number) // Ép kiểu từ query string sang Number
  @IsInt()
  @Min(1)
  @Max(100) // Tránh FE request quá lớn gây sập server
  limit?: number = 20;

  @IsOptional()
  @IsISO8601() // Đảm bảo cursor là chuẩn ISO Date string (VD: 2026-09-10T08:00:00.000Z)
  cursor?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SortDirection, {
    message: 'sortDirection phải là ASC hoặc DESC',
  })
  sortDirection?: SortDirection = SortDirection.DESC;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
