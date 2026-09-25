import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  Get,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { UserAvatarsService } from './user-avatars.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
// import { UpdateUserAvatarDto } from './dto/update-user-avatar.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('users/:userId/avatars')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserAvatarsController {
  constructor(private readonly avatarsService: UserAvatarsService) {}

  /**
   * Lấy danh sách tối đa 5 avatar để hiển thị thư viện ảnh đại diện
   */
  @Get()
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getAvatars(
    @Param('userId') userId: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.avatarsService.getUserAvatars(userId, forceRefresh);
    return {
      success: true,
      data,
      message: 'Danh sách ảnh đại diện đã tải thành công.',
    };
  }

  /**
   * Upload ảnh đại diện mới lên AWS S3 (Đường dẫn /avatars/2026/...)
   */
  @Patch()
  @RequirePermissions('hr:update:any') // In a real app, you'd add 'self:update' logic
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/i)) {
          return callback(
            new BadRequestException(
              'Chỉ chấp nhận tệp hình ảnh (jpg, jpeg, png, webp, gif).',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async updateAvatar(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() requester: ActiveUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp hình ảnh để tải lên.');
    }

    const data = await this.avatarsService.uploadAvatar(
      userId,
      file,
      requester,
    );
    return {
      success: true,
      data,
      message: 'Tải lên ảnh đại diện mới thành công.',
    };
  }

  /**
   * Chọn 1 trong các ảnh đã có trong thư viện làm ảnh đại diện chính
   */
  @Patch(':avatarId/select')
  @RequirePermissions('hr:update:any')
  async selectAvatar(
    @Param('userId') userId: string,
    @Param('avatarId') avatarId: string,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.avatarsService.selectAvatar(
      userId,
      avatarId,
      requester,
    );
    return {
      success: true,
      data,
      message: 'Đã thay đổi ảnh đại diện hoạt động.',
    };
  }
}
