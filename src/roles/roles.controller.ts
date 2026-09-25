// src/roles/roles.controller.ts
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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
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

@Controller(ROUTES.ROLE.BASE) // /roles
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions('it_system:create:any')
  async create(
    @Body() createRoleDto: CreateRoleDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.rolesService.create(createRoleDto, user);
    return {
      data,
      message: MESSAGES.SUCCESS.CREATED(RESOURCES.ROLE.BASE),
    };
  }
  // =====================================
  // STATIC ROUTES (Must come before :id)
  // =====================================
  @Get(ROUTES.GENERAL.RECYCLE_BIN) // /roles/recycle-bin
  @RequirePermissions('it_system:read:any')
  async findRecycleBin(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.rolesService.findRecycleBin(forceRefresh);
    return {
      data,
      message: 'Recycle bin retrieved successfully',
    };
  }

  @Get(ROUTES.PERMISSION.GROUP) // /roles/permissions/grouped
  @RequirePermissions('it_system:read:any')
  async getGroupedPermissions(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data =
      await this.rolesService.findAllPermissionsGrouped(forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.PERMISSION.GROUP_PLURAL),
    };
  }

  @Get(ROUTES.GENERAL.AVAILABLE) // /roles/available
  @RequirePermissions('it_system:read:any')
  async findAvailable(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.rolesService.findAvailable(forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ROLE.PLURAL, 'available'),
    };
  }

  @Get()
  @RequirePermissions('it_system:read:any')
  async findAll(@Query() query: RoleQueryDto) {
    // 1. Immutable Destructuring: Loại bỏ hoàn toàn toán tử delete, giữ vững V8 optimization
    const { refresh, ...cleanQuery } = query as RoleQueryDto & {
      refresh?: string;
    };
    const forceRefresh = refresh === 'true';

    const result = await this.rolesService.findAll(cleanQuery, forceRefresh);
    return {
      data: result.data,
      meta: result.meta,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ROLE.PLURAL),
    };
  }

  // =====================================
  // PARAMETERIZED ROUTES
  // =====================================

  @Patch(ROUTES.ROLE.PERMS) // /roles/:id/permissions
  @RequirePermissions('it_system:update:any')
  async updateRolePermissions(
    @Param('id') roleId: string,
    @Body('permissionIds') permissionIds: string[],
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.rolesService.updateRolePermissions(
      roleId,
      permissionIds || [],
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(
        RESOURCES.ROLE.BASE,
        RESOURCES.PERMISSION.PLURAL,
      ),
    };
  }

  @Patch(ROUTES.ROLE.USERS) // /roles/:id/users
  @RequirePermissions('it_system:update:any')
  async assignUsersToRole(
    @Param('id') roleId: string,
    @Body('userIds') userIds: string[],
  ) {
    const data = await this.rolesService.assignUsersToRole(
      roleId,
      userIds || [],
    );
    return {
      data,
      message: MESSAGES.SUCCESS.ASSIGN(
        RESOURCES.USER.PLURAL,
        RESOURCES.ROLE.BASE,
      ),
    };
  }

  @Post(':id/users/:userId') // POST /api/v1/roles/:id/users/:userId
  @RequirePermissions('it_system:update:any')
  async assignSingleUser(
    @Param('id') roleId: string,
    @Param('userId') userId: string,
    @CurrentUser() admin: ActiveUserData,
  ) {
    const data = await this.rolesService.assignSingleUser(
      roleId,
      userId,
      admin,
    );
    return {
      data,
      message: data.message,
    };
  }

  @Delete(':id/users/:userId') // DELETE /api/v1/roles/:id/users/:userId
  @RequirePermissions('it_system:update:any')
  async unassignSingleUser(
    @Param('id') roleId: string,
    @Param('userId') userId: string,
    @CurrentUser() admin: ActiveUserData,
  ) {
    const data = await this.rolesService.unassignSingleUser(
      roleId,
      userId,
      admin,
    );
    return {
      data,
      message: data.message,
    };
  }

  @Patch(ROUTES.GENERAL.TOGGLE_STATUS) // /roles/:id/status
  @RequirePermissions('it_system:update:any')
  async toggleStatus(
    @Param('id') id: string,
    @Body() toggleStatusDto: ToggleStatusDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.rolesService.toggleStatus(
      id,
      toggleStatusDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.ROLE.BASE, FIELDS.STATUS),
    };
  }
  //   @Patch(':id/users')
  //   @RequirePermissions('role:update:any', 'hr:update:any')
  //   assignUsers(@Param('id') id: string, @Body('userIds') userIds: string[]) {
  //     return this.rolesService.assignUsersToRole(id, userIds);
  //   }

  @Patch(ROUTES.GENERAL.RESTORE) // /roles/:id/restore
  @RequirePermissions('role:update:any')
  async restore(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    const data = await this.rolesService.restore(id, user);
    return {
      data,
      message: 'Role restored successfully',
    };
  }

  // @Get(ROUTES.GENERAL.ID) // /roles/:id
  // @RequirePermissions('it_system:read:any')
  // async findOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
  //   const forceRefresh = refresh === 'true';
  //   const data = await this.rolesService.findOne(id, forceRefresh);
  //   return {
  //     data,
  //     message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ROLE.BASE, 'details'),
  //   };
  // }

  @Get(ROUTES.GENERAL.ID) // /roles/:id
  @RequirePermissions('it_system:read:any')
  async getRoleDetails(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.rolesService.getRoleDetails(id, forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.ROLE.BASE, 'details'),
    };
  }

  @Patch(ROUTES.GENERAL.ID) // /roles/:id
  @RequirePermissions('it_system:update:any')
  async update(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.rolesService.update(id, updateRoleDto, user);
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.ROLE.BASE),
    };
  }

  @Delete(ROUTES.GENERAL.ID) // /roles/:id
  @RequirePermissions('it_system:delete:any')
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    await this.rolesService.remove(id, user);
    return {
      message: MESSAGES.SUCCESS.DELETED(RESOURCES.ROLE.BASE),
    };
  }
}
