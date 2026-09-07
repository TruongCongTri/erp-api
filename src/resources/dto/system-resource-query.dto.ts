import { IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';

export class ResourceQueryDto extends BaseQueryDto {
  @IsOptional()
  // Safely cast string "true"/"false" from URL query params to boolean
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isLive?: boolean;
}
