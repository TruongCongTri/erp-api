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

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller(ROUTES.AUTH.BASE) // /api/v1/auth
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // =====================================
  // PUBLIC ROUTES
  // =====================================

  // Medium Risk: Prevent fake account flooding
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 registrations per 5 minutes
  @Post(ROUTES.AUTH.REGISTER) // /api/v1/auth/register
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
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const data = await this.authService.login(dto, deviceInfo);
    return { data, message: 'Login successful' };
  }

  @Post(ROUTES.AUTH.GOOGLE) // /api/v1/auth/google
  async googleLogin(
    @Body('profile') profile: GoogleLoginDto,
    @Req() req: Request,
  ) {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const data = await this.authService.googleLogin(profile, deviceInfo);
    return { data, message: 'Google login successful' };
  }

  @Throttle({ default: { limit: 2, ttl: 60000 } }) // 2 resets per minute
  @Post(ROUTES.AUTH.FORGOT_PASSWORD) // /api/v1/auth/forgot-password
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email, dto.channel);
    return { message: 'If the email exists, an OTP has been sent.' };
  }

  @Post(ROUTES.AUTH.RESET_PASSWORD) // /api/v1/auth/reset-password
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  @Post(ROUTES.AUTH.REFRESH) // /api/v1/auth/refresh
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refreshToken(dto.refreshToken);
    return { data, message: 'Token refreshed successfully' };
  }

  // =====================================
  // PROTECTED USER ROUTES
  // =====================================

  @UseGuards(JwtAuthGuard)
  @Get(ROUTES.USERS.GET_ME) // /api/v1/auth/me
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
  async logout(@Req() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.sub, req.user.sessionId);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(ROUTES.AUTH.CHANGE_PASSWORD) // /api/v1/auth/change-password
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
  async sendVerifyOTP(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SendOtpDto,
  ) {
    await this.authService.sendVerifyOTP(req.user.sub, dto.channel);
    return { message: 'Verification OTP sent' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(ROUTES.AUTH.VERIFY_OTP) // /api/v1/auth/otp/verify
  async verifyOTP(@Req() req: AuthenticatedRequest, @Body() dto: VerifyOtpDto) {
    await this.authService.verifyOTP(req.user.sub, dto.otp);
    return { message: 'Account verified successfully' };
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Headers('user-agent') userAgent: string,
  ) {
    const deviceInfo = userAgent || 'Unknown Device';
    const result = await this.authService.verifyEmailToken(
      dto.userId,
      dto.token,
      deviceInfo,
    );

    // Extract message out so it maps perfectly to the GlobalExceptionFilter/Response interceptor format
    const { message, ...sessionData } = result;

    return {
      data: sessionData,
      message: message,
    };
  }

  @Post('resend-verification')
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
  async getActiveSessions(@Req() req: AuthenticatedRequest) {
    const data = await this.authService.getActiveSessions(req.user.sub);
    return { data, message: 'Active sessions retrieved' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(ROUTES.AUTH.SESSION_ID) // /api/v1/auth/sessions/:sessionId
  async revokeDeviceSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeDeviceSession(req.user.sub, sessionId);
    return { message: 'Device session revoked' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(ROUTES.AUTH.SESSION) // /api/v1/auth/sessions
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
  async adminTriggerPasswordReset(@Param('id') id: string) {
    await this.authService.adminTriggerPasswordReset(id);
    return { message: 'Password reset triggered for user' };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('hr:update:any')
  @Delete('admin/users/:id/sessions') // /api/v1/auth/admin/users/:id/sessions
  async adminRevokeAllUserSessions(@Param('id') id: string) {
    await this.authService.adminRevokeAllUserSessions(id);
    return { message: 'All sessions revoked for user' };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('hr:update:any')
  @Patch('admin/users/:id/verify') // /api/v1/auth/admin/users/:id/verify
  async adminVerifyUserEmail(@Param('id') id: string) {
    await this.authService.adminVerifyUserEmail(id);
    return { message: 'User verified manually by admin' };
  }
}
