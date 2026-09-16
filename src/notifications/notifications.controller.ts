import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Query,
  Post,
  // Req
} from '@nestjs/common';
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
import { NotificationCursorQueryDto } from './dto/notification-cursor-query.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

// interface AuthRequest extends Request {
//   user: JwtPayload;
// }

@Controller(ROUTES.NOTI.BASE) // /api/v1/notifications
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // =====================================
  // ENUMS ENDPOINT (CACHED)
  // =====================================
  @Get('enums')
  async getNotificationEnums(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';

    const result =
      await this.notificationsService.getNotificationEnums(forceRefresh);

    return {
      success: true,
      data: result,
      message: 'Lấy cấu hình danh mục thông báo thành công',
    };
  }

  @Get() // /api/v1/notifications
  async getMine(@CurrentUser() user: ActiveUserData) {
    const data = await this.notificationsService.getMyNotifications(user.id);
    return { data, message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.NOTI.PLURAL) };
  }

  @Get('page')
  async getNotificationsPage(
    @CurrentUser() user: ActiveUserData,
    @Query() query: NotificationCursorQueryDto,
  ) {
    const result = await this.notificationsService.getNotificationsPage(
      user.id,
      query,
    );

    return {
      success: true,
      data: result.data,
      meta: {
        nextCursor: result.nextCursor,
      },
      message: 'Lấy danh sách thông báo thành công',
    };
  }
  @Get('list')
  async findAll(
    @CurrentUser() user: ActiveUserData,
    @Query() query: NotificationQueryDto,
    // @Query('refresh') refresh?: string,
  ) {
    // if (query['refresh']) delete query['refresh'];

    // const forceRefresh = refresh === 'true';

    const result = await this.notificationsService.findAll(
      user.id,
      query,
      // forceRefresh,
    );

    return {
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách thông báo thành công',
    };
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

  @Post('seed-mock')
  async seedMockNotifications(@CurrentUser() user: ActiveUserData) {
    try {
      await this.notificationsService.seedMockDataForAdmin(user.id);
      return {
        success: true,
        message:
          'Đã tạo 50 thông báo mẫu thành công! Hãy tải lại trang để kiểm tra.',
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }
}
