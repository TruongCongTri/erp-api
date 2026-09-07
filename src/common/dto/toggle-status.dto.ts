// src/common/dto/toggle-status.dto.ts
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleStatusDto {
  @IsBoolean()
  @IsNotEmpty()
  isLive!: boolean;
}
