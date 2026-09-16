import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

// 1. Request DTO: Dùng để validate Query Params gửi lên
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number) // Coerces the string query param to a number
  @IsInt()
  @Min(1)
  page: number = 1; // Default to 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10; // Default to 10

  @IsOptional()
  @IsString()
  cursor?: string;
}

// 2. Response DTO: Dùng để định nghĩa cấu trúc dữ liệu trả về cho client
export class PaginationMetaDto {
  readonly current_page: number;
  readonly per_page: number;
  readonly total: number;
  readonly total_page: number;

  constructor(
    current_page: number,
    per_page: number,
    total: number,
    total_page: number,
  ) {
    this.current_page = current_page;
    this.per_page = per_page;
    this.total = total;
    this.total_page = total_page;
  }

  /**
   * Tạo từ style page/limit (Thường dùng cho Web)
   */
  static create(
    currentPage: number | string,
    perPage: number | string,
    total: number | string,
  ): PaginationMetaDto {
    const page = Math.max(1, Number(currentPage) || 1);
    const limit = Math.max(1, Number(perPage) || 10);
    const totalNum = Math.max(0, Number(total) || 0);

    const totalPage = limit > 0 ? Math.ceil(totalNum / limit) : 0;

    return new PaginationMetaDto(page, limit, totalNum, totalPage);
  }

  /**
   * Tạo từ style offset (skip/take) dùng cho TypeORM query
   */
  static fromOffset(
    skip: number | string,
    take: number | string,
    total: number | string,
  ): PaginationMetaDto {
    const s = Math.max(0, Number(skip) || 0);
    const t = Math.max(1, Number(take) || 10);
    const totalNum = Math.max(0, Number(total) || 0);

    const page = Math.floor(s / t) + 1;
    const totalPage = t > 0 ? Math.ceil(totalNum / t) : 0;

    return new PaginationMetaDto(page, t, totalNum, totalPage);
  }
}
