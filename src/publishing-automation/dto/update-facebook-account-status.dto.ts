import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { FacebookAccountStatus } from '../enums/publishing-automation.enum';

export class UpdateFacebookAccountStatusDto {
  @IsOptional()
  @IsEnum(FacebookAccountStatus)
  status?: FacebookAccountStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
