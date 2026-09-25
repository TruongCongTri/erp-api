// src/resources/system-resources.controller.ts
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
import { SystemResourcesService } from './system-resources.service';
import { CreateSystemResourceDto } from './dto/create-system-resource.dto';
import { UpdateSystemResourceDto } from './dto/update-system-resource.dto';
import { ResourceQueryDto } from './dto/system-resource-query.dto';
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

@Controller(ROUTES.RESOURCE.BASE) // api/v1/resources
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemResourcesController {
  constructor(
    private readonly systemResourcesService: SystemResourcesService,
  ) {}

  @Post()
  @RequirePermissions('it_system:update:any') // Admin action
  async create(
    @Body() createSystemResourceDto: CreateSystemResourceDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.systemResourcesService.create(
      createSystemResourceDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.CREATED(RESOURCES.RESOURCE.SYSTEM),
    };
  }

  // =====================================
  // STATIC ROUTES (Must come before :id)
  // =====================================
  @Get(ROUTES.GENERAL.AVAILABLE) // /api/v1/resources/available
  @RequirePermissions('it_system:read:any')
  async findAvailable(@Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const result =
      await this.systemResourcesService.findAvailable(forceRefresh);

    return {
      data: result,
      message: MESSAGES.SUCCESS.RETRIEVED(
        RESOURCES.RESOURCE.SYSTEM,
        'available',
      ),
    };
  }

  @Get()
  @RequirePermissions('it_system:read:any') // Read-only admin view
  async findAll(@Query() query: ResourceQueryDto) {
    // Delete the refresh key from the query object so it doesn't skew the JSON.stringify cache key!
    // if (query['refresh']) delete query['refresh'];

    // const forceRefresh = refresh === 'true';

    // const result = await this.systemResourcesService.findAll(
    //   query,
    //   forceRefresh,
    // );

    // Tách param bypass cache ra khỏi queryDto một cách bất biến (Immutable)
    const { refresh, ...cleanQuery } = query as ResourceQueryDto & {
      refresh?: string;
    };
    const forceRefresh = refresh === 'true';

    const result = await this.systemResourcesService.findAll(
      cleanQuery,
      forceRefresh,
    );

    return {
      data: result.data,
      meta: result.meta,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.RESOURCE.SYSTEM_PLURAL),
    };
  }

  @Get('matrix')
  @RequirePermissions('it_system:read:any')
  async getPermissionMatrix() {
    const data = await this.systemResourcesService.getPermissionMatrix();
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.RESOURCE.SYSTEM_PLURAL),
    };
  }

  @Get(ROUTES.GENERAL.RECYCLE_BIN) // /api/v1/resources/recycle-bin
  @RequirePermissions('it_system:read:any')
  async getRecycleBin(@Query('refresh') refresh?: string) {
    const data = await this.systemResourcesService.findRecycleBin(
      refresh === 'true',
    );
    return {
      data,
      message: 'Recycle bin retrieved successfully', // Replace with your MESSAGES constant
    };
  }

  // =====================================
  // PARAMETERIZED ROUTES
  // =====================================
  // UI Flow: Quick Toggle in Data Grid
  @Patch(ROUTES.GENERAL.TOGGLE_STATUS) // /api/v1/resources/:id/status
  @RequirePermissions('it_system:update:any')
  async toggleStatus(
    @Param('id') id: string,
    @Body() toggleStatusDto: ToggleStatusDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.systemResourcesService.toggleStatus(
      id,
      toggleStatusDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(
        RESOURCES.RESOURCE.SYSTEM,
        FIELDS.STATUS,
      ),
    };
  }

  @Patch(ROUTES.GENERAL.RESTORE) // /api/v1/resources/:id/restore
  @RequirePermissions('it_system:update:any')
  async restore(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    const data = await this.systemResourcesService.restore(id, user);
    return {
      data,
      message: 'Resource restored successfully', // Replace with your MESSAGES constant
    };
  }

  @Get(ROUTES.GENERAL.ID) // /api/v1/resources/:id
  @RequirePermissions('it_system:read:any')
  async findOne(@Param('id') id: string, @Query('refresh') refresh?: string) {
    const forceRefresh = refresh === 'true';
    const data = await this.systemResourcesService.findOne(id, forceRefresh);
    return {
      data,
      message: MESSAGES.SUCCESS.RETRIEVED(RESOURCES.RESOURCE.SYSTEM, 'details'),
    };
  }

  // UI Flow: Full Update in Detail Modal
  @Patch(ROUTES.GENERAL.ID) // /api/v1/resources/:id
  @RequirePermissions('it_system:update:any')
  async update(
    @Param('id') id: string,
    @Body() updateSystemResourceDto: UpdateSystemResourceDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.systemResourcesService.update(
      id,
      updateSystemResourceDto,
      user,
    );
    return {
      data,
      message: MESSAGES.SUCCESS.UPDATED(RESOURCES.RESOURCE.SYSTEM),
    };
  }

  @Delete(ROUTES.GENERAL.ID) // /api/v1/resources/:id
  @RequirePermissions('it_system:update:any') // Or 'role:delete:any' if you created it
  async remove(@Param('id') id: string, @CurrentUser() user: ActiveUserData) {
    await this.systemResourcesService.remove(id, user);
    return {
      message: MESSAGES.SUCCESS.DELETED(RESOURCES.RESOURCE.SYSTEM),
    };
  }
}
