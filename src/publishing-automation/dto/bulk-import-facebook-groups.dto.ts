import { Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateFacebookGroupDto } from './create-facebook-group.dto';

export class BulkImportFacebookGroupsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFacebookGroupDto)
  groups!: CreateFacebookGroupDto[];
}
