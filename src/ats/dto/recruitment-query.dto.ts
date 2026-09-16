import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from 'src/common/dto/base-query.dto'; // Adjust this path
import { RecruitmentRequestStatus } from '../enums/ats.enum';

export class RecruitmentQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(RecruitmentRequestStatus)
  status?: RecruitmentRequestStatus;
}
