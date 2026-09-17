import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JobApplicationsService } from './job-applications.service';
import {
  UpdateApplicationPhaseDto,
  QueryJobApplicationsDto,
} from './dto/candidate-submission.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { AuditActionType } from 'src/audit-log/audit-log.types';

@Controller('ats')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class JobApplicationsController {
  constructor(private readonly applicationsService: JobApplicationsService) {}

  @Get('jobs/:jobPostId/applications')
  @RequireAnyPermissions(
    'ats_candidate:read:any',
    'ats_candidate:read:dept',
    'ats_job_post:read:any',
    'ats_job_post:read:dept',
    'ats:candidates:read',
    'ats:jobs:read',
  )
  async getPipeline(
    @Param('jobPostId', ParseUUIDPipe) jobPostId: string,
    @Query() query: QueryJobApplicationsDto,
  ) {
    const result = await this.applicationsService.findByJobPost(
      jobPostId,
      query,
    );
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách ứng viên trong pipeline thành công',
    };
  }

  @Patch('applications/:id/phase')
  @RequireAnyPermissions(
    'ats_candidate:manage:any',
    'ats_candidate:update:any',
    'ats:candidates:manage',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Chuyển đổi giai đoạn tuyển dụng ứng viên',
    resourceSlug: 'ats_application',
    resourceLabel: 'Hồ sơ ứng tuyển',
    targetEntityIdParam: 'id',
  })
  async updatePhase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationPhaseDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.applicationsService.updatePhase(id, user, dto);
    return {
      success: true,
      data,
      message: `Đã chuyển ứng viên sang giai đoạn ${dto.phase}`,
    };
  }

  @Get('applications/:id/submissions')
  @RequireAnyPermissions(
    'ats_candidate:read:any',
    'ats_candidate:read:dept',
    'ats_candidate:manage:any',
    'ats:candidates:read',
    'ats:candidates:manage',
  )
  async getSubmissions(@Param('id', ParseUUIDPipe) id: string) {
    const submissions =
      await this.applicationsService.findSubmissionsByApplicationId(id);
    return {
      success: true,
      data: submissions,
      message: 'Lấy lịch sử các đợt nộp CV thành công',
    };
  }

  @Post('applications/:id/rescreen')
  @RequireAnyPermissions(
    'ats_candidate:manage:any',
    'ats_candidate:process:any',
    'ats:candidates:manage',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'HR chấm điểm lại thủ công sau lỗi sàng lọc AI',
    resourceSlug: 'ats_application',
    resourceLabel: 'Hồ sơ ứng tuyển',
    targetEntityIdParam: 'id',
  })
  async retryScreening(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.applicationsService.retryScreening(id, user);
    return {
      success: true,
      data,
      message: 'Đã đưa hồ sơ vào hàng đợi chấm điểm AI lại.',
    };
  }

  @Delete('applications/:id/submissions/:submissionId/cv')
  @RequireAnyPermissions(
    'ats_candidate:manage:any',
    'ats_candidate:delete:any',
    'ats:candidates:manage',
  )
  @AuditAction({
    actionType: AuditActionType.DELETE,
    actionLabel: 'Xóa thủ công CV ứng viên khỏi S3',
    resourceSlug: 'ats_application_submission',
    resourceLabel: 'Lượt nộp CV',
    targetEntityIdParam: 'submissionId',
  })
  async purgeCvNow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.applicationsService.purgeCvNow(
      id,
      submissionId,
      user,
    );
    return {
      success: true,
      data,
      message: 'Đã xóa CV khỏi hệ thống lưu trữ S3.',
    };
  }
}
