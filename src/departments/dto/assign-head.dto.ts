import { IsUUID, IsNotEmpty } from 'class-validator';

export class AssignHeadDto {
  @IsUUID('4')
  @IsNotEmpty()
  headUserId!: string;
}
