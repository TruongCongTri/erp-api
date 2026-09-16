import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
import { ApplicationPhase, PlatformSource } from '../enums/ats.enum';

export class QueryCandidatesDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(ApplicationPhase)
  status?: ApplicationPhase;

  @IsOptional()
  @IsEnum(PlatformSource)
  platform?: PlatformSource;

  @IsOptional()
  @IsUUID('4')
  jobPostId?: string;
}
