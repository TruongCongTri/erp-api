import type { Request } from 'express';
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  Param,
  Delete,
  Query,
  Headers,
  UseInterceptors,
  // UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  RegisterDto,
  LoginDto,
  GoogleLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
} from './dto/auth.dto';
import { AuthService } from './auth.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { ROUTES } from 'src/common/constants/routes.constant';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuditInterceptor } from 'src/audit-log/audit.interceptor';
import { AuditAction } from 'src/audit-log/audit-action.decorator';
import { ActorRoleLevel, AuditActionType } from 'src/audit-log/audit-log.types';
import {
  type ActiveUserData,
  CurrentUser,
} from 'src/common/decorators/current-user.decorator';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
type RequestWithAuditUser = Request & {
  user?: Partial<ActiveUserData> & {
    departmentId?: string;
    roleLevel?: ActorRoleLevel;
    jobTitle?: string;
  };
};
@Controller(ROUTES.AUTH.BASE) // /api/v1/auth
@UseInterceptors(AuditInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // =====================================
  // PUBLIC ROUTES
  // =====================================

  // Medium Risk: Prevent fake account flooding
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 registrations per 5 minutes
  @Post(ROUTES.AUTH.REGISTER) // /api/v1/auth/register
  @AuditAction({
    actionType: AuditActionType.CREATE,
    actionLabel: 'Đăng ký',
    resourceSlug: 'authentication',
    resourceLabel: 'Tài khoản',
  })
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto);
    return {
      data,
      message: 'Registration successful. Please verify your account.',
    };
  }

  // 1. Strict limit for Login (Prevent brute force: Max 5 attempts per 1 minute)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(ROUTES.AUTH.LOGIN) // /api/v1/auth/login
  @AuditAction({
    actionType: AuditActionType.LOGIN,
    actionLabel: 'Đăng nhập',
    resourceSlug: 'authentication',
    resourceLabel: 'Tài khoản',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const data = await this.authService.login(dto, deviceInfo);

    const authUser = data.user as typeof data.user & {
      department?: { id: string };
      role?: { level: string };
      jobTitle?: string;
    };

    const auditReq = req as RequestWithAuditUser;
    auditReq.user = {
      id: authUser.id,
      fullName: authUser.fullName,
      departmentId: authUser.department?.id || 'GLOBAL',
      roleLevel:
        (authUser.role?.level as ActorRoleLevel) || ActorRoleLevel.STAFF,
      jobTitle: authUser.jobTitle || 'Nhân viên',
    };
    return { data, message: 'Login successful' };
  }

  @Post(ROUTES.AUTH.GOOGLE) // /api/v1/auth/google
  @AuditAction({
    actionType: AuditActionType.LOGIN,
    actionLabel: 'Đăng nhập Google',
    resourceSlug: 'authentication',
    resourceLabel: 'Tài khoản',
  })
  async googleLogin(
    @Body('profile') profile: GoogleLoginDto,
    @Req() req: Request,
  ) {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const data = await this.authService.googleLogin(profile, deviceInfo);

    const authUser = data.user as typeof data.user & {
      department?: { id: string };
      role?: { level: string };
      jobTitle?: string;
    };

    const auditReq = req as RequestWithAuditUser;
    auditReq.user = {
      id: authUser.id,
      fullName: authUser.fullName,
      departmentId: authUser.department?.id || 'GLOBAL',
      roleLevel:
        (authUser.role?.level as ActorRoleLevel) || ActorRoleLevel.STAFF,
      jobTitle: authUser.jobTitle || 'Nhân viên',
    };
    return { data, message: 'Google login successful' };
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } }) // 2 resets per minute
  @Post(ROUTES.AUTH.FORGOT_PASSWORD) // /api/v1/auth/forgot-password
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Quên mật khẩu',
    resourceSlug: 'authentication',
    resourceLabel: 'Bảo mật tài khoản',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email, dto.channel);
    return { message: 'If the email exists, an OTP has been sent.' };
  }

  @Post(ROUTES.AUTH.RESET_PASSWORD) // /api/v1/auth/reset-password
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Đặt lại mật khẩu',
    resourceSlug: 'authentication',
    resourceLabel: 'Bảo mật tài khoản',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  @Post(ROUTES.AUTH.REFRESH) // /api/v1/auth/refresh
  // Không gắn Audit Log cho Refresh Token vì tần suất gọi ngầm cực cao -> Rác database
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refreshToken(dto.refreshToken);
    return { data, message: 'Token refreshed successfully' };
  }

  // =====================================
  // PROTECTED USER ROUTES
  // =====================================

  @UseGuards(JwtAuthGuard)
  @Get(ROUTES.USERS.GET_ME) // /api/v1/auth/me
  // 💡 Read-only API, không cần Audit Log
  async getMe(
    @Req() req: AuthenticatedRequest,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true';
    const data = await this.authService.getMe(req.user.sub, forceRefresh);
    return { data, message: 'Profile retrieved successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout') // /api/v1/auth/logout
  @AuditAction({
    actionType: AuditActionType.LOGOUT,
    actionLabel: 'Đăng xuất',
    resourceSlug: 'authentication',
    resourceLabel: 'Tài khoản',
  })
  async logout(
    @CurrentUser() user: ActiveUserData,
    @Req() req: AuthenticatedRequest,
  ) {
    (req as RequestWithAuditUser).user = user;

    await this.authService.logout(req.user.sub, req.user.sessionId);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(ROUTES.AUTH.CHANGE_PASSWORD) // /api/v1/auth/change-password
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Đổi mật khẩu',
    resourceSlug: 'authentication',
    resourceLabel: 'Bảo mật tài khoản',
  })
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(req.user.sub, dto);
    return { message: 'Password changed successfully' };
  }

  // 2. Ultra-strict limit for OTP (Prevent SMS/Email cost spikes: Max 1 per 60 seconds)
  @Throttle({ default: { limit: 1, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post(ROUTES.AUTH.SEND_OTP) // /api/v1/auth/otp/send
  // @AuditAction({
  //   action: 'SEND_OTP',
  //   resource: 'auth/otp/send',
  //   category: AuditCategory.AUTH,
  // }) // <-- AUDIT
  async sendVerifyOTP(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendOtpDto,
  ) {
    await this.authService.sendVerifyOTP(req.user.sub, dto.channel);
    return { message: 'Verification OTP sent' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(ROUTES.AUTH.VERIFY_OTP) // /api/v1/auth/otp/verify
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Xác thực OTP',
    resourceSlug: 'authentication',
    resourceLabel: 'Bảo mật tài khoản',
  })
  async verifyOTP(@Req() req: AuthenticatedRequest, @Body() dto: VerifyOtpDto) {
    await this.authService.verifyOTP(req.user.sub, dto.otp);
    return { message: 'Account verified successfully' };
  }

  @Post('verify-email')
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Xác minh Email',
    resourceSlug: 'authentication',
    resourceLabel: 'Tài khoản',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Headers('user-agent') userAgent: string,
    @Req() req: Request,
  ) {
    const deviceInfo = userAgent || 'Unknown Device';
    const result = await this.authService.verifyEmailToken(
      dto.userId,
      dto.token,
      deviceInfo,
    );

    const auditReq = req as RequestWithAuditUser;
    // Bơm user vào request để Audit Log ghi nhận đúng ID của người dùng vừa xác thực
    auditReq.user = {
      id: dto.userId,
      fullName: 'Email Verification User',
      departmentId: 'GLOBAL',
    };

    // Extract message out so it maps perfectly to the GlobalExceptionFilter/Response interceptor format
    const { message, ...sessionData } = result;

    return {
      data: sessionData,
      message: message,
    };
  }

  @Post('resend-verification')
  // @AuditAction({
  //   action: 'RESEND_VERIFICATION_EMAIL',
  //   resource: 'auth/resend-verification',
  //   category: AuditCategory.AUTH,
  // }) // <-- AUDIT
  async resendVerification(@Body('userId') userId: string) {
    const result =
      await this.authService.resendVerificationEmailCooldown(userId);

    return {
      message: result.message,
    };
  }

  // --- Session Management ---

  @UseGuards(JwtAuthGuard)
  @Get(ROUTES.AUTH.SESSION) // /api/v1/auth/sessions
  // NOTE: AuditAction omitted here for the same reason as getMe (read-only self-fetch)
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const data = await this.authService.getActiveSessions(req.user.sub);
    return { data, message: 'Active sessions retrieved' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(ROUTES.AUTH.SESSION_ID) // /api/v1/auth/sessions/:sessionId
  @AuditAction({
    actionType: AuditActionType.REVOKE_ACCESS,
    actionLabel: 'Thu hồi phiên đăng nhập',
    resourceSlug: 'session',
    resourceLabel: 'Phiên hoạt động',
  })
  async revokeDeviceSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeDeviceSession(req.user.sub, sessionId);
    return { message: 'Device session revoked' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(ROUTES.AUTH.SESSION) // /api/v1/auth/sessions
  @AuditAction({
    actionType: AuditActionType.REVOKE_ACCESS,
    actionLabel: 'Thu hồi toàn bộ phiên đăng nhập khác',
    resourceSlug: 'session',
    resourceLabel: 'Phiên hoạt động',
  })
  async revokeOtherSessions(@Req() req: AuthenticatedRequest) {
    await this.authService.revokeOtherSessions(
      req.user.sub,
      req.user.sessionId,
    );
    return { message: 'All other sessions revoked' };
  }

  // =====================================
  // ADMIN / HR ROUTES
  // =====================================

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('hr:update:any')
  @Post('admin/users/:id/reset-password') // /api/v1/auth/admin/users/:id/reset-password
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Reset mật khẩu nhân viên',
    resourceSlug: 'admin_users',
    resourceLabel: 'Quản lý tài khoản',
    targetEntityIdParam: 'id', // Tự động trích xuất param :id làm đối tượng bị thay đổi
  })
  async adminTriggerPasswordReset(@Param('id') id: string) {
    await this.authService.adminTriggerPasswordReset(id);
    return { message: 'Password reset triggered for user' };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('hr:update:any')
  @Delete('admin/users/:id/sessions') // /api/v1/auth/admin/users/:id/sessions
  @AuditAction({
    actionType: AuditActionType.REVOKE_ACCESS,
    actionLabel: 'Đăng xuất tất cả thiết bị của nhân viên',
    resourceSlug: 'admin_users',
    resourceLabel: 'Quản lý tài khoản',
    targetEntityIdParam: 'id',
  })
  async adminRevokeAllUserSessions(@Param('id') id: string) {
    await this.authService.adminRevokeAllUserSessions(id);
    return { message: 'All sessions revoked for user' };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('hr:update:any')
  @Patch('admin/users/:id/verify') // /api/v1/auth/admin/users/:id/verify
  @AuditAction({
    actionType: AuditActionType.UPDATE,
    actionLabel: 'Xác thực tài khoản thủ công',
    resourceSlug: 'admin_users',
    resourceLabel: 'Quản lý tài khoản',
    targetEntityIdParam: 'id',
  })
  async adminVerifyUserEmail(@Param('id') id: string) {
    await this.authService.adminVerifyUserEmail(id);
    return { message: 'User verified manually by admin' };
  }
}
