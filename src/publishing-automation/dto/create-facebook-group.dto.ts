import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { GroupMembershipStatus } from '../enums/publishing-automation.enum';

export class CreateFacebookGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  groupUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  jobTypes!: string[];

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsUUID()
  assignedAccountId!: string;

  @IsEnum(GroupMembershipStatus)
  membershipStatus!:
    | GroupMembershipStatus.ACTIVE_MEMBER
    | GroupMembershipStatus.PENDING_APPROVAL;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyPostLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownMinutes?: number;
}
