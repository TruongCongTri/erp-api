import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JobPostsService } from './job-posts.service';
import { AtsAiService } from './ats-ai.service';
import {
  AiSuggestJdDto,
  CreateJobPostDto,
  UpdateJobPostDto,
  ReviewJobPostDto,
  PublishJobPostDto,
  QueryJobPostDto,
} from './dto/job-post.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { AuditActionType } from 'src/audit-log/audit-log.types';

@Controller('job-posts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class JobPostsController {
  constructor(
    private readonly jobPostsService: JobPostsService,
    private readonly aiService: AtsAiService,
  ) {}

  // ==========================================
  // AI JD DRAFTING (GEMINI 3.6 FLASH)
  // ==========================================
  @Post('ai-suggest')
  @RequireAnyPermissions(
    'ats_job_post:create:any',
    'ats_job_post:create:dept',
    'ats_job_post:update:any',
    'ats:jobs:create',
    'ats:jobs:manage',
  )
  async aiSuggest(@Body() dto: AiSuggestJdDto) {
    const suggestedData = await this.aiService.suggestJdFromPrompt(
      dto.rawPrompt,
    );
    return {
      success: true,
      data: suggestedData,
      message: 'Soạn thảo JD bằng Gemini 3.6 Flash thành công',
    };
  }

  // ==========================================
  // REUSABLE TEMPLATES LIBRARY
  // ==========================================
  @Get('templates')
  @RequireAnyPermissions(
    'ats_job_post:read:any',
    'ats_job_post:read:dept',
    'ats:jobs:read',
    'ats:jobs:create',
  )
  async getTemplates() {
    const data = await this.jobPostsService.getTemplates();
    return {
      success: true,
      data,
      message: 'Lấy thư viện mẫu JD thành công',
    };
  }

  // ==========================================
  // JOB POST CRUD & RETRIEVAL
  // ==========================================
  @Post()
  @RequireAnyPermissions(
    'ats_job_post:create:any',
    'ats_job_post:create:dept',
    'ats:jobs:create',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Tạo bản tin tuyển dụng',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
  })
  async createDraft(
    @Body() dto: CreateJobPostDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.createDraft(dto, user);
    return {
      success: true,
      data,
      message: 'Lưu bản tin tuyển dụng thành công',
    };
  }

  @Get()
  @RequireAnyPermissions(
    'ats_job_post:read:any',
    'ats_job_post:read:dept',
    'ats:jobs:read',
    'ats:jobs:manage',
  )
  async findAll(
    @Query() query: QueryJobPostDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const result = await this.jobPostsService.findAll(query, user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách tin tuyển dụng thành công',
    };
  }

  @Get(':id')
  @RequireAnyPermissions(
    'ats_job_post:read:any',
    'ats_job_post:read:dept',
    'ats:jobs:read',
    'ats:jobs:manage',
  )
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'Lấy chi tiết tin tuyển dụng thành công',
    };
  }

  @Patch(':id')
  @RequireAnyPermissions(
    'ats_job_post:update:any',
    'ats_job_post:update:dept',
    'ats:jobs:edit',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Cập nhật tin tuyển dụng',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobPostDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.update(id, user, dto);
    return {
      success: true,
      data,
      message: 'Cập nhật tin tuyển dụng thành công',
    };
  }

  // ==========================================
  // APPROVAL WORKFLOW ROUTING
  // ==========================================
  @Post(':id/request-approval')
  @RequireAnyPermissions(
    'ats_job_post:update:any',
    'ats_job_post:update:dept',
    'ats:jobs:edit',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Gửi duyệt tin tuyển dụng',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.sendForHeadApproval(id, user);
    return {
      success: true,
      data,
      message: 'Đã gửi bản tin cho Trưởng bộ phận xét duyệt',
    };
  }

  @Patch(':id/head-review')
  @RequireAnyPermissions(
    'ats_job_post:approve:any',
    'ats_job_post:approve:dept',
    'ats_job_post:update:any',
    'ats:jobs:approve',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.APPROVE,
    actionLabel: 'Trưởng bộ phận duyệt tin tuyển dụng',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async headReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewJobPostDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.reviewByHead(id, user, dto);
    return {
      success: true,
      data,
      message: dto.isApproved
        ? 'Phê duyệt tin tuyển dụng thành công'
        : 'Đã trả về bản nháp kèm ghi chú yêu cầu chỉnh sửa',
    };
  }

  // ==========================================
  // MULTI-CHANNEL DISPATCH & CLOSE
  // ==========================================
  @Post(':id/publish')
  @RequireAnyPermissions(
    'ats_job_post:update:any',
    'ats_job_post:create:any',
    'ats:jobs:publish',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.APPROVE,
    actionLabel: 'Xuất bản tin đa kênh',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishJobPostDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.publish(id, user, dto);
    return {
      success: true,
      data,
      message: dto.scheduledPublishAt
        ? 'Đã thiết lập lịch xuất bản tự động thành công'
        : 'Xuất bản tin đa kênh thành công',
    };
  }

  @Patch(':id/close')
  @RequireAnyPermissions(
    'ats_job_post:update:any',
    'ats_job_post:delete:any',
    'ats:jobs:manage',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Đóng tin tuyển dụng',
    resourceSlug: 'ats_job_post',
    resourceLabel: 'Bản tin tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.jobPostsService.closeJob(id, user);
    return {
      success: true,
      data,
      message: 'Đã đóng tin tuyển dụng và thu hồi trên các nền tảng',
    };
  }
}
