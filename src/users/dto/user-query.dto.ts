import { IsOptional, IsEnum, IsString } from 'class-validator';
import { UserStatus } from 'src/users/enums/user-status.enum';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';

export class UserQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  roleId?: string;
}
