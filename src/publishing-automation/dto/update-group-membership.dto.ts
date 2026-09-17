import { IsEnum } from 'class-validator';
import { GroupMembershipStatus } from '../enums/publishing-automation.enum';

export class UpdateGroupMembershipDto {
  @IsEnum(GroupMembershipStatus)
  membershipStatus!: GroupMembershipStatus;
}
