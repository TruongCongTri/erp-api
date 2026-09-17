// src/common/guards/permissions.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { ANY_PERMISSIONS_KEY } from '../decorators/require-any-permissions.decorator';

// 1. Define a strict type for the Request object to satisfy ESLint
interface RequestWithUser extends Request {
  user?: {
    id: string;
    role?: { slug: string };
    permissions?: string[];
    departmentId?: string;
  };
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredAny = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredAll && !requiredAny) return true;

    // 2. Cast the request to our strictly-typed interface
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.permissions) {
      throw new ForbiddenException('User permissions not loaded');
    }

    // Check for Super Admin wildcard
    if (user.permissions.includes('*:*:any')) {
      return true;
    }

    // 3. Super Admin & Executive Board Bypass (More efficient than checking arrays)
    if (
      user.role?.slug === 'SUPER_ADMIN' ||
      user.role?.slug === 'EXEC_CEO' ||
      user.permissions.includes('*:*:any')
    ) {
      return true;
    }

    // 4. Check RequirePermissions
    // if user has ALL required permissions for this route
    if (requiredAll) {
      const hasAll = requiredAll.every((p) => user.permissions!.includes(p));
      if (!hasAll)
        throw new ForbiddenException(
          `Missing required permissions: ${requiredAll.join(', ')}`,
        );
    }

    // 5. Check RequireAnyPermissions
    // if user has ONE of required permissions for this route
    if (requiredAny) {
      const hasAny = requiredAny.some((p) => user.permissions!.includes(p));
      if (!hasAny)
        throw new ForbiddenException(
          `Requires one of: ${requiredAny.join(', ')}`,
        );
    }

    return true;
  }
}
