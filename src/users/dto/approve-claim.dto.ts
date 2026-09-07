import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class ApproveClaimDto {
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsArray()
  @IsOptional()
  @IsUUID('all', { each: true })
  bonusPermissionIds?: string[];
}
