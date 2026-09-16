/**
 * Controller để truy vấn dữ liệu Audit cho trang Admin, và mở cổng POST cho Frontend tự gửi log bảo mật từ phía Client (Ví dụ: Log sự kiện User Login/Logout, đổi mật khẩu).
 *
 *
 * */
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { CreateClientAuditEventDto } from './dto/create-client-audit-event.dto';
import { SaveAuditLogDto } from './dto/save-audit-log.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type ActiveUserData,
} from 'src/common/decorators/current-user.decorator';
import { ActorRoleLevel, AuditDataScope } from './audit-log.types';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequireAnyPermissions } from 'src/common/decorators/require-any-permissions.decorator';
import { resolveActorRoleLevel } from './constants/role-hierarchy.constant';

type ExtendedUser = ActiveUserData & {
  departmentId?: string;
  roleLevel?: ActorRoleLevel;
  roleSlug?: string;
  jobTitle?: string;
};

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequireAnyPermissions(
    'audit_log:read:any',
    'audit_log:read:dept',
    'audit_log:read:own',
  )
  async findAll(
    @Query() query: QueryAuditLogDto,
    @CurrentUser() user: ActiveUserData,
  ) {
    const extUser = user as ExtendedUser;
    const permissions = extUser.permissions || [];
    const roleSlug = extUser.roleSlug || '';

    // 1. Resolve roleLevel dynamically if absent from JWT
    const roleLevel = extUser.roleLevel ?? resolveActorRoleLevel(roleSlug);

    // 2. High-level leadership checks (Super Admin, IT Sys Admin, Board of Directors)
    const isGlobalAuditViewer =
      permissions.includes('audit_log:read:any') ||
      permissions.includes('*:*:any') ||
      roleLevel === ActorRoleLevel.SUPER_ADMIN ||
      roleLevel === ActorRoleLevel.SYSTEM_ADMIN ||
      roleLevel === ActorRoleLevel.EXECUTIVE;

    // 3. Department heads & Directors (restricted to their department)
    const isDeptAuditViewer =
      permissions.includes('audit_log:read:dept') ||
      roleLevel === ActorRoleLevel.DIRECTOR ||
      roleLevel === ActorRoleLevel.HEAD_DEPT;

    let scope: AuditDataScope;

    if (isGlobalAuditViewer) {
      scope = { type: 'ALL' };
    } else if (isDeptAuditViewer) {
      scope = {
        type: 'DEPARTMENT',
        departmentId: extUser.departmentId || 'GLOBAL',
        excludeResourceSlug: 'authentication',
      };
    } else {
      scope = {
        type: 'OWN',
        actorId: extUser.id,
      };
    }

    const result = await this.auditLogService.findAll(query, scope);

    return {
      success: true,
      data: result.data,
      meta: result.meta,
      message: 'Lấy nhật ký hệ thống thành công',
    };
  }

  /**
   * Endpoint dành riêng cho Frontend đẩy log (Client-side actions)
   */
  @Post('client')
  async createClientLog(
    @Body() dto: CreateClientAuditEventDto,
    @CurrentUser() user: ActiveUserData,
    @Req() request: Request,
  ) {
    const saveDto = new SaveAuditLogDto();

    // 1. Sao chép payload từ Client
    Object.assign(saveDto, dto);

    const extendedUser = user as ExtendedUser;

    saveDto.actorId = extendedUser.id;
    saveDto.actorName = extendedUser.fullName || 'Unknown';
    saveDto.actorInitials = (extendedUser.fullName || 'UN')
      .substring(0, 2)
      .toUpperCase();

    saveDto.actorDepartmentId = extendedUser.departmentId || 'GLOBAL';

    // 3. Tiêm các trường bảo mật tuyệt đối từ JWT và Request
    saveDto.actorId = extendedUser.id;
    saveDto.actorName = extendedUser.fullName || 'Unknown'; // Lấy trực tiếp vì đã có trong interface
    saveDto.actorInitials = (extendedUser.fullName || 'UN')
      .substring(0, 2)
      .toUpperCase();

    saveDto.actorTitle = extendedUser.jobTitle || 'Staff';
    saveDto.ipAddress =
      request.ip || request.socket?.remoteAddress || 'unknown';
    saveDto.userAgent = (request.headers['user-agent'] as string) || 'unknown';

    await this.auditLogService.logAction(saveDto);

    return {
      success: true,
      message: 'Đã ghi nhận Audit Log',
    };
  }

  // =====================================
  // API TẠO DỮ LIỆU MẪU (TESTING)
  // =====================================
  @Post('seed-mock')
  async seedMockData() {
    try {
      await this.auditLogService.seedMockAuditLogs();
      return {
        success: true,
        message:
          'Đã tạo 50 Audit Logs mẫu thành công! Bạn có thể kiểm tra danh sách.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Tạo dữ liệu mẫu thất bại: ${(error as Error).message}`,
      };
    }
  }
}
