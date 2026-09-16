import { IsOptional, IsUUID, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';

export const DEPARTMENT_SORT_FIELDS = ['name', 'code', 'createdAt'] as const;
export type DepartmentSortField = (typeof DEPARTMENT_SORT_FIELDS)[number];

export class QueryDepartmentDto extends BaseQueryDto {
  // `search`, `page`, `limit`, `sortOrder`, `cursor` được kế thừa từ BaseQueryDto

  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  isRootOnly?: boolean; // Chỉ lấy các khối/phòng ban cấp cao nhất (parentId IS NULL)

  @IsOptional()
  @IsIn(DEPARTMENT_SORT_FIELDS)
  override sortBy?: DepartmentSortField = 'name';
}
