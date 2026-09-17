import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { StaggeredScheduleService } from './staggered-schedule.service';
import { ScheduleGroupDistributionDto } from './dto/schedule-group-distribution.dto';

@Controller('facebook/schedule')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaggeredScheduleController {
  constructor(private readonly scheduleService: StaggeredScheduleService) {}

  @Post('distribute-groups')
  @RequireAnyPermissions(
    'publishing_automation:create:any',
    'publishing_automation:manage:any',
  )
  async distribute(
    @Body() dto: ScheduleGroupDistributionDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.scheduleService.distribute(dto, user);
    return {
      success: true,
      data,
      message: `Đã lên lịch ${data.length} bài đăng phân tán ngẫu nhiên thành công`,
    };
  }
}
