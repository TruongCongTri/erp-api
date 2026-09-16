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
import { RecruitmentRequestService } from './recruitment-request.service';
import {
  CreateRecruitmentRequestDto,
  UpdateRecruitmentRequestDto,
  ReviewRecruitmentRequestDto,
  QueryRecruitmentRequestDto,
} from './dto/recruitment-request.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { AuditActionType } from 'src/audit-log/audit-log.types';

@Controller('ats/requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(AuditInterceptor)
export class RecruitmentRequestController {
  constructor(private readonly requisitionService: RecruitmentRequestService) {}

  @Post()
  @RequireAnyPermissions(
    'ats_requisition:create:any',
    'ats_requisition:create:dept',
  )
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Tạo yêu cầu tuyển dụng',
    resourceSlug: 'ats_requisition',
    resourceLabel: 'Yêu cầu tuyển dụng',
  })
  async create(
    @Body() dto: CreateRecruitmentRequestDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.requisitionService.create(dto, user);
    return {
      success: true,
      data,
      message: 'Khởi tạo yêu cầu tuyển dụng thành công',
    };
  }

  @Get()
  @RequireAnyPermissions(
    'ats_requisition:read:any',
    'ats_requisition:read:dept',
  )
  async findAll(
    @Query() query: QueryRecruitmentRequestDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const result = await this.requisitionService.findAll(query, user);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy danh sách yêu cầu tuyển dụng thành công',
    };
  }

  @Get(':id')
  @RequireAnyPermissions(
    'ats_requisition:read:any',
    'ats_requisition:read:dept',
  )
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.requisitionService.findOne(id, user);
    return {
      success: true,
      data,
      message: 'Lấy thông tin chi tiết yêu cầu tuyển dụng thành công',
    };
  }

  @Patch(':id')
  @RequireAnyPermissions(
    'ats_requisition:update:any',
    'ats_requisition:update:dept',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Cập nhật nội dung yêu cầu tuyển dụng',
    resourceSlug: 'ats_requisition',
    resourceLabel: 'Yêu cầu tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecruitmentRequestDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.requisitionService.update(id, dto, user);
    return {
      success: true,
      data,
      message: 'Cập nhật nội dung yêu cầu thành công',
    };
  }

  @Patch(':id/review')
  @RequireAnyPermissions(
    'ats_requisition:approve:any',
    'ats_requisition:approve:dept',
    'ats_requisition:update:any',
  )
  @AuditAction({
    actionType: AuditActionType.APPROVE,
    actionLabel: 'Phê duyệt/Từ chối yêu cầu tuyển dụng',
    resourceSlug: 'ats_requisition',
    resourceLabel: 'Yêu cầu tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRecruitmentRequestDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.requisitionService.review(id, dto, user);
    return {
      success: true,
      data,
      message: 'Xét duyệt yêu cầu tuyển dụng thành công',
    };
  }

  @Patch(':id/cancel')
  @RequireAnyPermissions(
    'ats_requisition:update:any',
    'ats_requisition:update:dept',
    'ats_requisition:delete:any',
    'ats_requisition:delete:dept',
  )
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Hủy yêu cầu tuyển dụng',
    resourceSlug: 'ats_requisition',
    resourceLabel: 'Yêu cầu tuyển dụng',
    targetEntityIdParam: 'id',
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ActiveUserData,
  ) {
    const data = await this.requisitionService.cancel(id, user);
    return {
      success: true,
      data,
      message: 'Hủy yêu cầu tuyển dụng thành công',
    };
  }
}
