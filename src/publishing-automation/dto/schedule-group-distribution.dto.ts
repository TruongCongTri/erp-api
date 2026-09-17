import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Matches,
} from 'class-validator';

export class ScheduleGroupDistributionDto {
  @IsString()
  @IsNotEmpty()
  atsJobId!: string;

  @IsString()
  @IsNotEmpty()
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  jobDescription!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  selectedGroupIds!: string[];

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'targetDate phải có định dạng YYYY-MM-DD',
  })
  targetDate!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'windowStartTime phải có định dạng HH:mm',
  })
  windowStartTime!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'windowEndTime phải có định dạng HH:mm',
  })
  windowEndTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minBufferMinutes?: number = 25;
}
