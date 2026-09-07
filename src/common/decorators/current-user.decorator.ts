import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Define the shape of the user object returned by your JwtStrategy
export interface ActiveUserData {
  id: string;
  sub?: string;
  email: string;
  fullName: string;
  roleSlug: string;
  permissions: string[];
  sessionId?: string;
}

interface RequestWithUser extends Request {
  user: ActiveUserData;
}

export const CurrentUser = createParamDecorator(
  (data: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // If a specific property is requested (e.g., @CurrentUser('id')), return just that
    return data ? user?.[data] : user;
  },
);
