import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UserAvatarsService } from './user-avatars.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
import { UpdateUserAvatarDto } from './dto/update-user-avatar.dto';

@Controller('users/:userId/avatars')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserAvatarsController {
  constructor(private readonly avatarsService: UserAvatarsService) {}

  @Patch()
  @RequirePermissions('hr:update:any') // In a real app, you'd add 'self:update' logic
  async updateAvatar(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserAvatarDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.avatarsService.updateAvatar(userId, dto, requester);
    return { data, message: 'Avatar updated successfully' };
  }
}
