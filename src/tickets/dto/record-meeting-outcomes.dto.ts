// record-meeting-outcomes.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TicketActionItemDto {
  @IsString()
  @IsNotEmpty()
  task!: string;

  @IsUUID()
  assigneeId!: string;

  @IsDateString()
  dueDate!: string;
}

export class RecordMeetingOutcomesDto {
  @IsString()
  @IsNotEmpty()
  outcomesSummary!: string; // Mandatory recap of decisions before resolving/closing

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketActionItemDto)
  actionItems!: TicketActionItemDto[];
}
