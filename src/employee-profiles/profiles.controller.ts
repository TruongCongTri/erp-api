import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
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

@Controller('profiles') // 👈 Changed to /profiles for independent entity management
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async findAll(
    @Query() query: ProfileQueryDto,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    if (query['refresh']) delete query['refresh'];

    const { data, meta } = await this.profilesService.findAll(
      query,
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
  async getProfileByCode(@Param('employeeCode') employeeCode: string) {
    const data = await this.profilesService.getProfileByCode(employeeCode);
    return { data, message: 'Profile retrieved successfully' };
  }

  // 2. HR updates a profile directly
  @Patch(':profileId')
  @RequirePermissions('hr:update:any')
  async updateProfile(
    @Param('profileId') profileId: string, // 👈 Targeting profileId now
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.profilesService.updateProfile(
      profileId,
      dto,
      adminUser,
    );
    return { data, message: 'Profile updated successfully' };
  }

  // 3. Secure Self-Service or Deep HR verification
  @Post('user/:userId/secure')
  @RequirePermissions('hr:read:any')
  async getProfileSecurely(
    @Param('userId') userId: string,
    @Body() dto: SecureAccessDto,
    @CurrentUser() requester: ActiveUserData,
  ) {
    const data = await this.profilesService.getProfileSecurely(
      userId,
      requester,
      dto,
    );
    return { data, message: 'Profile accessed securely' };
  }
}
