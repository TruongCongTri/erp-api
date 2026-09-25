// src/permissions/permissions.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { ToggleStatusDto } from 'src/common/dto/toggle-status.dto';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { FIELDS } from 'src/common/constants/field.constant';
import { ROUTES } from 'src/common/constants/routes.constant';
import {
  type ActiveUserData,
  CurrentUser,
} from 'src/common/decorators/current-user.decorator';

@Controller(ROUTES.PERMISSION.BASE) // /api/v1/permissions
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @RequirePermissions('it_system:create:any') // Reusing role mgmt permissions
  async create(
    @Body() createPermissionDto: CreatePermissionDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.permissionsService.create(
      createPermissionDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.CREATED(RESOURCES.PERMISSION.BASE),
    };
  }

  // =====================================
  // STATIC ROUTES (Must come before :id)
  // =====================================
  @Get(ROUTES.GENERAL.AVAILABLE) // /api/v1/permissions/available
  @RequirePermissions('it_system:read:any')
  async findAvailable(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.permissionsService.findAvailable(forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(
        RESOURCES.PERMISSION.PLURAL,
        'available',
      ),
    };
  }

  @Get()
  @RequirePermissions('it_system:read:any')
  async findAll(@Query() query: PermissionQueryDto) {
    // Tách param refresh bằng destructuring bất biến, tránh làm sai lệch cache key
    const { refresh, ...cleanQuery } = query as PermissionQueryDto & {
      refresh?: string;
    };
    const forceRefresh = refresh === 'true';

    const result = await this.permissionsService.findAll(
      cleanQuery,
      forceRefresh,
    );
    return {
      data: result.data,
      meta: result.meta,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.PERMISSION.PLURAL),
    };
  }

  @Get('enums') // /api/v1/permissions/enums
  @RequirePermissions('it_system:read:any')
  async getEnums(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.permissionsService.getPermissionEnums(forceRefresh);
    return {
      data,
      message: 'Permission enums retrieved successfully',
    };
  }

  // =====================================
  // PARAMETERIZED ROUTES
  // =====================================
  @Patch(ROUTES.GENERAL.TOGGLE_STATUS) // /api/v1/permissions/:id/toggle-status
  @RequirePermissions('it_system:update:any')
  async toggleStatus(
    @Param('id') id: string,
    @Body() toggleStatusDto: ToggleStatusDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.permissionsService.toggleStatus(
      id,
      toggleStatusDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(
        RESOURCES.PERMISSION.BASE,
        FIELDS.STATUS,
      ),
    };
  }

  @Patch(ROUTES.GENERAL.RESTORE) // /api/v1/permissions/:id/restore
  @RequirePermissions('it_system:update:any')
  async restore(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    const data = await this.permissionsService.restore(id, user);
    return {
      data,
      message: 'Permission restored successfully', // Replace with your MESSAGES constant
    };
  }

  @Get(ROUTES.GENERAL.ID) // /api/v1/permissions/:id
  @RequirePermissions('it_system:read:any')
  async findOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.permissionsService.findOne(id, forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(
        RESOURCES.PERMISSION.BASE,
        FIELDS.DETAIL,
      ),
    };
  }

  @Patch(ROUTES.GENERAL.ID) // /api/v1/permissions/:id
  @RequirePermissions('it_system:update:any')
  async update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.permissionsService.update(
      id,
      updatePermissionDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.PERMISSION.BASE),
    };
  }

  @Delete(ROUTES.GENERAL.ID) // /api/v1/permissions/:id
  @RequirePermissions('it_system:delete:any')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    await this.permissionsService.remove(id, user);
    return {
      message: MESSAGES.SUCCESS.DELETED(RESOURCES.PERMISSION.BASE),
    };
  }
}
