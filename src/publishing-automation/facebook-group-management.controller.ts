import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { FacebookGroupService } from './facebook-group.service';
import { GroupSuitabilityService } from './group-suitability.service';
import { CreateFacebookGroupDto } from './dto/create-facebook-group.dto';
import { BulkImportFacebookGroupsDto } from './dto/bulk-import-facebook-groups.dto';
import { UpdateGroupMembershipDto } from './dto/update-group-membership.dto';
import { GroupRecommendationQueryDto } from './dto/group-recommendation-query.dto';

@Controller('facebook/groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FacebookGroupManagementController {
  constructor(
    private readonly groupService: FacebookGroupService,
    private readonly suitabilityService: GroupSuitabilityService,
  ) {}

  @Post()
  @RequireAnyPermissions(
    'publishing_automation:create:any',
    'publishing_automation:manage:any',
  )
  async create(
    @Body() dto: CreateFacebookGroupDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.groupService.create(dto, user);
    return {
      success: true,
      data,
      message: 'Đã thêm nhóm Facebook thành công',
    };
  }

  @Post('bulk-import')
  @RequireAnyPermissions(
    'publishing_automation:create:any',
    'publishing_automation:manage:any',
  )
  async bulkImport(
    @Body() dto: BulkImportFacebookGroupsDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.groupService.bulkImport(dto, user);
    return {
      success: true,
      data,
      message: `Đã nhập ${data.imported.length} nhóm, bỏ qua ${data.skipped.length} nhóm`,
    };
  }

  @Get()
  @RequireAnyPermissions(
    'publishing_automation:read:any',
    'publishing_automation:manage:any',
  )
  async findAll() {
    const data = await this.groupService.findAll();
    return {
      success: true,
      data,
      message: 'Lấy danh sách nhóm Facebook thành công',
    };
  }

  @Post('recommendations')
  @RequireAnyPermissions(
    'publishing_automation:read:any',
    'publishing_automation:manage:any',
  )
  async recommend(@Body() dto: GroupRecommendationQueryDto) {
    const data = await this.suitabilityService.recommend(dto);
    return {
      success: true,
      data,
      message: 'Gợi ý nhóm Facebook phù hợp thành công',
    };
  }

  @Patch(':id/membership')
  @RequireAnyPermissions(
    'publishing_automation:update:any',
    'publishing_automation:manage:any',
  )
  async updateMembership(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupMembershipDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.groupService.updateMembership(id, dto, user);
    return {
      success: true,
      data,
      message: 'Cập nhật trạng thái thành viên nhóm thành công',
    };
  }
}
