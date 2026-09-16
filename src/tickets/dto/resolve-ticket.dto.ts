// resolve-ticket.dto.ts
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResolveTicketDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Resolution note must be at least 10 characters long',
  })
  resolutionNote!: string; // Explains the concrete resolution or attached artifacts
}
