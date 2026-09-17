import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class GroupRecommendationQueryDto {
  @IsString()
  @IsNotEmpty()
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  jobType!: string;

  @IsArray()
  @IsString({ each: true })
  requiredSkills!: string[];

  @IsOptional()
  @IsBoolean()
  filterOnlyActiveMembers?: boolean = true;
}
