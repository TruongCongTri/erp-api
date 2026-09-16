// reject-ticket.dto.ts
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RejectTicketDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Rejection reason must be at least 10 characters long',
  })
  rejectionReason!: string; // e.g., "Wrong department", "Duplicate ticket", "Out of scope"
}
