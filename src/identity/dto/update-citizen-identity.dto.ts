import { PartialType } from '@nestjs/mapped-types';
import { CreateCitizenIdentityDto } from './create-citizen-identity.dto';

export class UpdateCitizenIdentityDto extends PartialType(
  CreateCitizenIdentityDto,
) {}
