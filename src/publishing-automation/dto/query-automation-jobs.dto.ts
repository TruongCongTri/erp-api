import { IsString, IsNotEmpty } from 'class-validator';

export class QueryAutomationJobsDto {
  @IsString()
  @IsNotEmpty()
  atsJobPostingId!: string;
}
