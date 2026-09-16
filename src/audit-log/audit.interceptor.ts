// audit.interceptor.ts
/**
 * The interceptor extracts the HTTP context, reads the metadata from Decorator @AuditAction,
 * and automatically save Audit Log whenever an execution is succeeded or failed.
 * */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap, catchError } from 'rxjs';
import type { Request, Response } from 'express';
import { AuditLogService } from './audit-log.service';
import {
  AUDIT_ACTION_KEY,
  type AuditActionMetadata,
} from './audit-action.decorator';
import { SaveAuditLogDto } from './dto/save-audit-log.dto';
import {
  AuditStatus,
  DiffChangeType,
  AuditClientApp,
  ActorRoleLevel,
} from './audit-log.types';
import { ActiveUserData } from 'src/common/decorators/current-user.decorator';

type ExtendedUser = ActiveUserData & {
  departmentId?: string;
  roleLevel?: ActorRoleLevel;
  jobTitle?: string;
  avatarUrl?: string;
};

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditMeta = this.reflector.get<AuditActionMetadata | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // Nếu route không đánh dấu @AuditAction thì bỏ qua
    if (!auditMeta) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    // const user = (request as Request & { user?: ExtendedUser }).user;

    // if (!user) return next.handle(); // Bỏ qua nếu route không có thông tin xác thực

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const user = (request as Request & { user?: ExtendedUser }).user;
        this.logEvent(
          request,
          user,
          auditMeta,
          AuditStatus.SUCCESS,
          undefined,
          responseBody,
        );
      }),
      catchError((error: Error) => {
        const user = (request as Request & { user?: ExtendedUser }).user;
        this.logEvent(
          request,
          user,
          auditMeta,
          AuditStatus.FAILED,
          error.message,
        );
        throw error;
      }),
    );
  }

  private logEvent(
    request: Request,
    user: ExtendedUser | undefined,
    meta: AuditActionMetadata,
    status: AuditStatus,
    failureReason?: string,
    _responseBody: unknown = null,
  ) {
    const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    const rawParam = meta.targetEntityIdParam
      ? request.params[meta.targetEntityIdParam]
      : undefined;

    // Trích xuất targetEntityId từ param của URL (nếu khai báo)
    const targetEntityId = rawParam
      ? Array.isArray(rawParam)
        ? String(rawParam[0])
        : String(rawParam)
      : 'N/A';

    const logDto = new SaveAuditLogDto();

    // -- Lấp đầy dữ liệu Actor --
    logDto.actorId = user?.id || SYSTEM_UUID;
    logDto.actorName = user?.fullName || 'Anonymous User';
    logDto.actorInitials = (user?.fullName || 'NA')
      .substring(0, 2)
      .toUpperCase();
    logDto.actorAvatarUrl = user?.avatarUrl || undefined;
    logDto.actorDepartmentId = user?.departmentId || 'GLOBAL';
    logDto.actorRoleLevel = user?.roleLevel || ActorRoleLevel.STAFF;
    logDto.actorTitle = user?.jobTitle || 'Nhân viên';

    // -- Lấp đầy dữ liệu Mạng / Trạng thái --
    logDto.ipAddress = ipAddress;
    logDto.userAgent = userAgent;
    logDto.clientApp = AuditClientApp.WEB_PORTAL;
    logDto.requestUrl = `${request.method} ${request.originalUrl}`;
    logDto.status = status;
    logDto.failureReason = failureReason;

    // -- Lấp đầy dữ liệu Resource --
    logDto.actionType = meta.actionType;
    logDto.actionLabel = meta.actionLabel;
    logDto.resourceSlug = meta.resourceSlug;
    logDto.resourceLabel = meta.resourceLabel;
    logDto.targetDepartmentId = user?.departmentId || 'GLOBAL'; // Fallback logic
    logDto.targetEntityId = targetEntityId;
    logDto.summary = `${meta.actionLabel} đối với ${meta.resourceLabel}`;

    // -- Fake Payload rỗng vì Interceptor khó có thể bóc tách granular diff
    // -- (Granular diff nên được gọi bằng tay trong Service)
    logDto.diffPayload = {
      changeType:
        status === AuditStatus.SUCCESS
          ? DiffChangeType.UPDATED
          : DiffChangeType.STATUS_TRANSITION,
      fields: [],
    };

    // Đẩy xử lý chạy ngầm (Fire and forget)
    void this.auditLogService.logAction(logDto);
  }
}
