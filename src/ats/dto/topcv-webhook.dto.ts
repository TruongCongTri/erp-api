import { IsString, IsEmail, IsOptional } from 'class-validator';

export class TopCvWebhookPayloadDto {
  @IsString()
  job_id!: string;

  @IsString()
  @IsOptional()
  job_title?: string;

  @IsString()
  @IsOptional()
  apply_at?: string;

  @IsString()
  candidate_name!: string;

  @IsEmail()
  candidate_email!: string;

  @IsString()
  candidate_phone!: string;

  @IsString()
  download_url!: string; // Must match TopCV exactly
}
