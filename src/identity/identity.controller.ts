import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import { ParseCccdQrDto } from './dto/parse-cccd-qr.dto';
import { UpdateCitizenIdentityDto } from './dto/update-citizen-identity.dto';
import { ApplyQrIdentityDto } from './dto/apply-qr-identity.dto';
import { CreateBasicIdentityDto } from './dto/create-basic-identity.dto';

@Controller('identity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // 1. TỐI ƯU HIỂN THỊ DANH SÁCH & BẢN XEM TRƯỚC (Masked View & QR Preview)
  /**
   * [Tiêu chí 3 & 4] Lấy thông tin tóm tắt an toàn (CCCD đã che mờ: ********1234)
   * Phục vụ hiển thị trên bảng HR/Profile mà không cần giải mã, hỗ trợ Cache Redis 24h.
   */
  @Get('profiles/:profileId/summary')
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getIdentitySummary(@Param('profileId') profileId: string) {
    const data = await this.identityService.getIdentitySummary(profileId);
    return {
      success: true,
      data,
      message: 'Thông tin tóm tắt căn cước công dân đã được tải.',
    };
  }

  /**
   * Phân tích chuỗi QR code trực tiếp từ Front-end Camera (Preview nhanh, không lưu CSDL)
   */
  @Post('cccd/parse-qr')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:create:any', 'hr:update:any')
  parseQrCode(@Body() dto: ParseCccdQrDto) {
    const data = this.identityService.parseCccdQr(dto.qrString);
    return {
      success: true,
      data,
      message: 'Giải mã chuỗi QR CCCD thành công.',
    };
  }

  // 2. KHỞI TẠO & HOÀN THIỆN HỒ SƠ CCCD (Manual Draft -> QR Verification)
  /**
   * Khởi tạo thủ công các trường cơ bản (Status: DRAFT)
   */
  @Post('profiles/:profileId/basic')
  @RequirePermissions('hr:create:any', 'hr:update:any')
  async createBasicCccd(
    @Param('profileId') profileId: string,
    @Body() dto: CreateBasicIdentityDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.identityService.createBasicCccd(
      profileId,
      dto,
      adminUser,
    );
    return {
      success: true,
      data,
      message: 'Đã tạo thông tin CCCD cơ bản (trạng thái chờ đối soát).',
    };
  }

  /**
   * Hoàn thiện/Cập nhật dữ liệu từ mã QR (Status: VERIFIED)
   * Tự động tính ngày hết hạn thẻ và mã hóa 2 chiều AES-GCM xuống CSDL.
   */
  @Post('profiles/:profileId/apply-qr')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:create:any', 'hr:update:any')
  async applyQrCode(
    @Param('profileId') profileId: string,
    @Body() dto: ApplyQrIdentityDto,
    @CurrentUser() currentUser: ActiveUserData,
  ) {
    const data = await this.identityService.applyQrCodeData(
      profileId,
      dto,
      currentUser,
    );
    return {
      success: true,
      data,
      message: 'Đã cập nhật và xác thực dữ liệu CCCD từ mã QR thành công.',
    };
  }

  /**
   * Cập nhật thủ công các trường thông tin CCCD
   */
  @Patch('profiles/:profileId')
  @RequirePermissions('hr:update:any')
  async updateCccd(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateCitizenIdentityDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.identityService.updateCccd(profileId, dto, adminUser);
    return {
      success: true,
      message: 'Cập nhật thông tin CCCD thành công.',
    };
  }

  // 3. XÁC THỰC NÂNG CAO (Step-Up Authentication & Decryption)
  /**
   * Mở khóa xem toàn bộ thông tin CCCD đã giải mã
   * BẮT BUỘC nhập mật khẩu xác nhận (Chính chủ hoặc HR có quyền hạn).
   * TUYỆT ĐỐI KHÔNG LƯU VÀO REDIS CACHE.
   */
  @Post('users/:userId/secure-cccd')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:read:any')
  async getCccdSecurely(
    @Param('userId') userId: string,
    @Body() dto: SecureAccessDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.identityService.getCccdSecurely(
      userId,
      requester,
      dto,
    );
    return {
      success: true,
      data,
      message: 'Thông tin căn cước công dân đã được giải mã an toàn.',
    };
  }

  // @Post('users/:userId/secure-cccd')
  // @RequirePermissions('hr:read:any')
  // async getCccdSecurely(
  //   @Param('userId') userId: string,
  //   @Body() dto: SecureAccessDto,
  //   @CurrentUser() requester: ActiveUserData,
  // ) {
  //   const data = await this.identityService.getCccdSecurely(
  //     userId,
  //     requester,
  //     dto,
  //   );
  //   return { data, message: 'CCCD accessed securely' };
  // }

  // @Post('cccd/parse-qr')
  // @RequirePermissions('hr:create:any', 'hr:update:any')
  // parseQrCode(@Body() dto: ParseCccdQrDto) {
  //   const data = this.identityService.parseCccdQr(dto.qrString);
  //   return { data, message: 'QR Code parsed successfully' };
  // }

  // @Post('users/:userId/cccd')
  // @RequirePermissions('hr:create:any', 'hr:update:any')
  // async createCccd(
  //   @Param('userId') userId: string,
  //   @Body() dto: CreateCitizenIdentityDto,
  //   @CurrentUser() adminUser: ActiveUserData,
  // ) {
  //   // You will need to add this method to your IdentityService!
  //   const data = await this.identityService.createCccd(userId, dto, adminUser);
  //   return { data, message: 'CCCD created successfully' };
  // }

  // @Patch('users/:userId/cccd')
  // @RequirePermissions('hr:update:any')
  // async updateCccd(
  //   @Param('userId') userId: string,
  //   @Body() dto: UpdateCitizenIdentityDto,
  //   @CurrentUser() adminUser: ActiveUserData,
  // ) {
  //   const data = await this.identityService.updateCccd(userId, dto, adminUser);
  //   return { data, message: 'CCCD updated successfully' };
  // }
}
