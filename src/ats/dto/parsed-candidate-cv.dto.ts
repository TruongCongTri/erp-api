import {
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsOptional,
  Min,
  IsInt,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EducationLevel } from '../enums/ats.enum';

export class EmploymentHistoryItemDto {
  @IsString()
  company!: string;

  @IsString()
  role!: string;

  @IsInt()
  @Min(0)
  durationMonths!: number;
}

export class ParsedCandidateCvDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(15)
  hardSkills!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  softSkills!: string[];

  @IsNumber()
  @Min(0)
  experienceYears!: number;

  @IsEnum(EducationLevel)
  educationLevel!: EducationLevel;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  certifications: string[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmploymentHistoryItemDto)
  @ArrayMaxSize(10)
  employmentHistory!: EmploymentHistoryItemDto[];

  @IsString()
  @MaxLength(600)
  summary!: string;
}
