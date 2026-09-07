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

// 1. Define a strict type for the Request object to satisfy ESLint
interface RequestWithUser extends Request {
  user?: {
    role?: {
      slug: string;
    };
    permissions?: string[];
  };
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions) {
      return true;
    }

    // 2. Cast the request to our strictly-typed interface
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // 🐛 DEBUG LOGS
    console.log('\n--- [PermissionsGuard] DEBUG ---');
    console.log('User Object:', JSON.stringify(user, null, 2));
    console.log('Required Perms:', requiredPermissions);
    console.log('--------------------------------\n');

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

    // 4. Check if user has ALL required permissions for this route
    const hasPermission = requiredPermissions.every((reqPerm) =>
      // We use the non-null assertion (!) because we already verified user.permissions exists
      user.permissions!.includes(reqPerm),
    );

    if (!hasPermission) {
      console.log('❌ Access Denied: Missing permissions');
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
