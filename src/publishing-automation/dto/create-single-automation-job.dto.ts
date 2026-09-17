import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsEnum,
  IsOptional,
  IsISO8601,
} from 'class-validator';
import { AutomationPlatform } from '../enums/publishing-automation.enum';

export class CreateSingleAutomationJobDto {
  @IsString()
  @IsNotEmpty()
  atsJobId!: string;

  // Facebook Group posts must go through /facebook/schedule/distribute-groups
  // (it enforces per-group cooldown/daily-limit rules tied to ManagedFacebookGroup).
  // This endpoint is for platforms with no group concept: a single destination portal.
  @IsEnum([AutomationPlatform.TOPCV, AutomationPlatform.CAREERVIET])
  platform!: AutomationPlatform.TOPCV | AutomationPlatform.CAREERVIET;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  targetDestination!: string;

  @IsString()
  @IsNotEmpty()
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  // Omit to publish immediately; pass an ISO datetime to schedule for later.
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
