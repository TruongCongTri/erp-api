import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignTicketDto {
  @IsUUID()
  @IsNotEmpty()
  assigneeId!: string;

  @IsOptional()
  @IsString()
  internalHandoverNote?: string; // Private context note for the assignee
}
