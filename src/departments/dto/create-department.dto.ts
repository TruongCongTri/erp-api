import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Slug chỉ được chứa chữ thường, số, gạch ngang và gạch dưới (e.g. core-epc, mep)',
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code!: string; // e.g., 'DEPT-HR', 'EPC-MEP'

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @IsOptional()
  @IsUUID('4')
  headUserId?: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
