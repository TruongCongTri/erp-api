// schedule-ticket-meeting.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUrl,
  IsUUID,
  MaxLength,
  IsArray,
} from 'class-validator';

export class ScheduleTicketMeetingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  agenda!: string;

  @IsDateString()
  scheduledStart!: string; // ISO 8601

  @IsDateString()
  scheduledEnd!: string; // ISO 8601

  @IsOptional()
  @IsUrl()
  meetingUrl?: string; // MS Teams, Google Meet, or Zoom link

  @IsOptional()
  @IsUUID()
  meetingId?: string; // Link to an existing event in ERP /vi/meetings module

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attendeeIds?: string[];
}
