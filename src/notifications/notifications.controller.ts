import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  // Req
} from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { JwtPayload } from 'src/auth/strategies/jwt.strategy';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { ROUTES } from 'src/common/constants/routes.constant';
import {
  type ActiveUserData,
  CurrentUser,
} from 'src/common/decorators/current-user.decorator';

// interface AuthRequest extends Request {
//   user: JwtPayload;
// }

@Controller(ROUTES.NOTI.BASE) // /api/v1/notifications
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get() // /api/v1/notifications
  async getMine(@CurrentUser() user: ActiveUserData) {
    const data = await this.notificationsService.getMyNotifications(user.id);
    return { data, message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.NOTI.PLURAL) };
  }

  @Patch(ROUTES.NOTI.READ_ALL) // /api/v1/notifications/read-all
  async markAllRead(@CurrentUser() user: ActiveUserData) {
    await this.notificationsService.markAllAsRead(user.id);
    return { message: MESSAGES.SUCCESS.NOTI.ALL_READ };
  }

  @Patch(ROUTES.NOTI.READ_DETAIL) // /api/v1/notifications/:id/read
  async markRead(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    await this.notificationsService.markAsRead(user.id, id);
    return { message: MESSAGES.SUCCESS.NOTI.READ };
  }
}
