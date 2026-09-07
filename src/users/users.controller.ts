// src/users/users.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { FIELDS } from 'src/common/constants/field.constant';
import { ROUTES } from 'src/common/constants/routes.constant';
import {
  type ActiveUserData,
  CurrentUser,
} from 'src/common/decorators/current-user.decorator';
import { ApproveClaimDto } from './dto/approve-claim.dto';
import { ClaimProfileDto } from './dto/claim-profile.dto';

@Controller(ROUTES.USERS.BASE) // /api/v1/users
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post() // /api/v1/users
  @RequirePermissions('hr:create:any')
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.usersService.create(createUserDto, user);
    return {
      data,
      message: MESSAGES.SUCCESS.CREATED(RESOURCES.USER.BASE),
    };
  }

  // =====================================
  // STATIC ROUTES (Must come before :id)
  // =====================================
  @Get(ROUTES.GENERAL.RECYCLE_BIN) // /api/v1/users/recycle-bin
  @RequirePermissions('hr:read:any')
  async findRecycleBin() {
    const data = await this.usersService.findRecycleBin();
    return { data, message: 'User recycle bin retrieved' };
  }

  @Get(ROUTES.GENERAL.AVAILABLE) // /api/v1/users/available
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async findAvailable(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.usersService.findAvailable(forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.USER.PLURAL, 'available'),
    };
  }

  @Get('access') // /api/v1/users/access
  @RequirePermissions('hr:read:any', 'hr:read:dept', 'it_system:read:any')
  async getAllUsersAccess(@Query() query: UserQueryDto) {
    const { data, meta } = await this.usersService.findAll(query);
    return {
      success: true,
      data,
      meta,
      message: 'Users access list retrieved',
    };
  }

  @Get() // /api/v1/users
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async findAll(
    @Query() query: UserQueryDto,
    @Query('refresh') refresh?: string,
  ) {
    if (query['refresh']) delete query['refresh'];

    const forceRefresh = refresh === 'true';

    const result = await this.usersService.findAll(query, forceRefresh);
    return {
      data: result.data,
      meta: result.meta,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.USER.PLURAL),
    };
  }

  // =====================================
  // DYNAMIC ID ROUTES
  // =====================================

  // Specialized Route for IT/Admin to update system access
  @Get(':id/access') // /api/v1/users/:id/access
  @RequirePermissions('hr:read:any', 'hr:read:dept', 'it_system:read:any')
  async getUserAccessDetails(@Param('id') id: string) {
    const data = await this.usersService.getUserAccessDetails(id);
    return {
      success: true,
      data,
      message: 'User access details retrieved',
    };
  }

  @Patch('access/:id') // /api/v1/users/access/:id (Adjusted to avoid conflict with standard Patch ID)
  @RequirePermissions('role:update:any', 'hr:update:any')
  async updateUserAccess(
    @Param('id') id: string,
    @Body() accessDto: { roleId: string; bonusPermissionIds: string[] },
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.usersService.updateUserAccess(
      id,
      accessDto.roleId,
      accessDto.bonusPermissionIds,
      adminUser,
    );
    return {
      success: true,
      data: null,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.USER.PLURAL, FIELDS.ACCESS),
    };
  }

  // -------------------------------------
  // EMPLOYEE UI PROFILES & SENSITIVE DATA
  // -------------------------------------

  @Get(':id/quick-profile') // /api/v1/users/:id/quick-profile
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getQuickProfile(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.usersService.getQuickProfile(id, forceRefresh);
    return { success: true, data, message: 'Quick profile retrieved' };
  }

  @Get(':id/full-profile') // /api/v1/users/:id/full-profile
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getFullProfile(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.usersService.getFullProfile(id, forceRefresh);
    return { success: true, data, message: 'Full profile retrieved' };
  }

  // STEP-UP AUTHENTICATION: CCCD Unlock
  @Post(':id/unlock/identity') // /api/v1/users/:id/unlock/identity
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async unlockIdentity(
    @Param('id') id: string,
    @Body() passwordDto: { password: string },
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.usersService.unlockIdentityData(
      id,
      passwordDto,
      adminUser,
    );
    return { success: true, data, message: 'Dữ liệu CCCD đã được mở khóa.' };
  }

  // STEP-UP AUTHENTICATION: Financial Unlock
  @Post(':id/unlock/financial') // /api/v1/users/:id/unlock/financial
  @RequirePermissions('finance:read:any', 'hr:read:any') // Extended to finance role
  async unlockFinancial(
    @Param('id') id: string,
    @Body() passwordDto: { password: string },
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.usersService.unlockFinancialData(
      id,
      passwordDto,
      adminUser,
    );
    return {
      success: true,
      data,
      message: 'Dữ liệu tài chính đã được mở khóa.',
    };
  }

  // -------------------------------------

  @Patch(':id/restore') // /api/v1/users/:id/restore
  @RequirePermissions('hr:update:any')
  async restore(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    const data = await this.usersService.restore(id, user);
    return { data, message: 'User restored successfully' };
  }

  @Get(ROUTES.GENERAL.ID) // /api/v1/users/:id (Fallback standard findOne)
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async findOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.usersService.findOne(id, forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.USER.BASE, 'details'),
    };
  }

  // HR Standard Update (Name, Profile, Address, etc.)
  @Patch(ROUTES.GENERAL.ID) // /api/v1/users/:id
  @RequirePermissions('hr:update:any')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    const data = await this.usersService.update(id, updateUserDto, adminUser);
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.USER.BASE),
    };
  }

  // Soft Delete / Terminate Employee
  @Delete(ROUTES.GENERAL.ID) // /api/v1/users/:id
  @RequirePermissions('hr:delete:any')
  async remove(
    @Param('id') id: string,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.usersService.remove(id, adminUser);
    return {
      message: MESSAGES.SUCCESS.USER.REVOKE,
    };
  }

  // =====================================
  // CLAIM PROFILE WORKFLOW
  // =====================================

  // 1. Worker initiates claim (Requires basic login, no strict RBAC needed)
  @Post('claim-profile')
  async submitProfileClaim(
    @Body() dto: ClaimProfileDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.usersService.submitProfileClaim(user.id, dto);
    return { success: true, data, message: data.message };
  }

  // 2. HR fetches the pending list
  @Get('claims/pending')
  @RequirePermissions('hr:read:any', 'hr:read:dept')
  async getPendingClaims(
    @Query() query: UserQueryDto,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    if (query['refresh']) delete query['refresh'];

    const { data, meta } = await this.usersService.getPendingClaims(
      query,
      forceRefresh,
    );
    return { success: true, data, meta, message: 'Danh sách chờ phê duyệt.' };
  }

  // 3. HR Approves the claim and assigns the role
  @Post('claims/:id/approve')
  @RequirePermissions('hr:update:any', 'role:update:any')
  async approveProfileClaim(
    @Param('id') id: string,
    @Body() dto: ApproveClaimDto,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.usersService.approveProfileClaim(
      id,
      dto.roleId,
      dto.bonusPermissionIds,
      adminUser,
    );
    return {
      success: true,
      message: 'Đã phê duyệt liên kết hồ sơ và phân quyền thành công.',
    };
  }

  // 4. HR Rejects the claim
  @Post('claims/:id/reject')
  @RequirePermissions('hr:update:any')
  async rejectProfileClaim(
    @Param('id') id: string,
    @CurrentUser() adminUser: ActiveUserData,
  ) {
    await this.usersService.rejectProfileClaim(id, adminUser);
    return { success: true, message: 'Đã từ chối yêu cầu liên kết hồ sơ.' };
  }
}
