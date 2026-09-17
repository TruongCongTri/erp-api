import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { AutomationJobsService } from './automation-jobs.service';
import { CreateSingleAutomationJobDto } from './dto/create-single-automation-job.dto';
import { QueryAutomationJobsDto } from './dto/query-automation-jobs.dto';

@Controller('automation/jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomationJobsController {
  constructor(private readonly jobsService: AutomationJobsService) {}

  @Get()
  @RequireAnyPermissions(
    'publishing_automation:read:any',
    'publishing_automation:manage:any',
  )
  async findByAtsJobPostingId(@Query() query: QueryAutomationJobsDto) {
    const data = await this.jobsService.findByAtsJobPostingId(
      query.atsJobPostingId,
    );
    return {
      success: true,
      data,
      message: 'Lấy danh sách trạng thái đăng bài đa kênh thành công',
    };
  }

  @Get(':id')
  @RequireAnyPermissions(
    'publishing_automation:read:any',
    'publishing_automation:manage:any',
  )
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.jobsService.findOne(id);
    return {
      success: true,
      data,
      message: 'Lấy chi tiết tác vụ đăng bài thành công',
    };
  }

  @Post()
  @RequireAnyPermissions(
    'publishing_automation:create:any',
    'publishing_automation:manage:any',
  )
  async create(
    @Body() dto: CreateSingleAutomationJobDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobsService.createSingleJob(dto, user);
    return {
      success: true,
      data,
      message: dto.scheduledAt
        ? 'Đã lên lịch đăng bài thành công'
        : 'Đã đưa vào hàng đợi đăng bài ngay lập tức',
    };
  }

  @Post(':id/retry')
  @RequireAnyPermissions(
    'publishing_automation:update:any',
    'publishing_automation:manage:any',
  )
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobsService.retry(id, user);
    return {
      success: true,
      data,
      message: 'Đã đưa tác vụ vào hàng đợi thử lại',
    };
  }
}
