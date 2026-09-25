import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
import { ProfileQueryDto } from './dto/profile-query.dto';
import { UpdateFinancialDto } from './dto/update-financial.dto';
import { CreateSalaryRecordDto } from './dto/create-salary-record.dto';

@Controller('profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async findAll(@Query() query: ProfileQueryDto) {
    // Tối ưu V8 Engine: Immutable destructuring thay vì delete key
    const { refresh, ...cleanQuery } = query as ProfileQueryDto & {
      refresh?: string;
    };
    const forceRefresh = refresh === 'true';

    const { data, meta } = await this.profilesService.findAll(
      cleanQuery,
      forceRefresh,
    );

    return {
      success: true,
      data,
      meta,
      message: 'Danh sách hồ sơ nhân viên đã được tải',
    };
  }

  // 1. HR reviews a seeded profile before approving a claim
  @Get('code/:employeeCode')
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getProfileByCode(
    @Param('employeeCode') employeeCode: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.profilesService.getProfileByCode(
      employeeCode,
      forceRefresh,
    );
    return { success: true, data, message: 'Profile retrieved successfully' };
  }

  // 2. HR updates a profile directly
  @Patch(':profileId')
  @RequirePermissions('hr:update:any')
  async updateProfile(
    @Param('profileId') profileId: string, // Targeting profileId now
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.profilesService.updateProfile(
      profileId,
      dto,
      adminUser,
    );
    return {
      success: true,
      data,
      message: 'Cập nhật thông tin hồ sơ thành công.',
    };
  }

  // 3. Secure Self-Service or Deep HR verification
  // @Post('user/:userId/secure')
  // @RequirePermissions('hr:read:any')
  // async getProfileSecurely(
  //   @Param('userId') userId: string,
  //   @Body() dto: SecureAccessDto,
  //   @CurrentUser() requester: ActiveUserData,
  // ) {
  //   const data = await this.profilesService.getProfileSecurely(
  //     userId,
  //     requester,
  //     dto,
  //   );
  //   return { data, message: 'Profile accessed securely' };
  // }

  /**
   * Mở khóa xem Mã số thuế & BHXH (Chỉ Owner hoặc HR có quyền)
   */
  @Post(':profileId/financial/unlock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:read:financial', 'hr:read:any')
  async unlockFinancial(
    @Param('profileId') profileId: string,
    @Body() dto: SecureAccessDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.profilesService.unlockFinancialData(
      profileId,
      dto,
      requester,
    );
    return {
      success: true,
      data,
      message: 'Dữ liệu thuế và bảo hiểm xã hội đã được giải mã.',
    };
  }

  /**
   * Cập nhật Mã số thuế & BHXH (Yêu cầu mật khẩu xác nhận để ghi đè mã hóa)
   */
  @Patch(':profileId/financial')
  @RequirePermissions('hr:update:financial')
  async updateFinancial(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateFinancialDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.profilesService.updateFinancialData(profileId, dto, adminUser);
    return {
      success: true,
      message: 'Thông tin thuế và bảo hiểm xã hội đã được cập nhật an toàn.',
    };
  }

  // =========================================================================
  // 4. SECURE SUB-MODULE: SALARY HISTORY & ADJUSTMENT (Step-Up Auth)
  // =========================================================================

  /**
   * Xem toàn bộ dòng thời gian biến động lương (Chỉ Owner hoặc HR chuyên trách)
   */
  @Post(':profileId/salary-history/unlock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('hr:read:salary', 'hr:read:any')
  async unlockSalaryHistory(
    @Param('profileId') profileId: string,
    @Body() dto: SecureAccessDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.profilesService.unlockSalaryHistory(
      profileId,
      dto,
      requester,
    );
    return {
      success: true,
      data,
      message: 'Lịch sử thu nhập và điều chỉnh lương đã được giải mã.',
    };
  }

  /**
   * Thêm một mốc điều chỉnh lương mới (Tự động cập nhật isCurrent và mã hóa AES-GCM)
   */
  @Post(':profileId/salary-history')
  @RequirePermissions('hr:manage:salary')
  async addSalaryAdjustment(
    @Param('profileId') profileId: string,
    @Body() dto: CreateSalaryRecordDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.profilesService.addSalaryAdjustment(profileId, dto, adminUser);
    return {
      success: true,
      message: 'Đã tạo mốc điều chỉnh lương mới cho nhân viên.',
    };
  }
}
