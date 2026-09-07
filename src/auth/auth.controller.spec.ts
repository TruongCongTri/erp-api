import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { Request } from 'express';
import { GoogleLoginDto } from './dto/auth.dto';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    googleLogin: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    refreshToken: jest.fn(),
    getMe: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    sendVerifyOTP: jest.fn(),
    verifyOTP: jest.fn(),
    getActiveSessions: jest.fn(),
    revokeDeviceSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
    adminTriggerPasswordReset: jest.fn(),
    adminRevokeAllUserSessions: jest.fn(),
    adminVerifyUserEmail: jest.fn(),
  };

  const mockReq = {
    headers: { 'user-agent': 'Jest-Agent' },
  } as unknown as Request;
  const mockAuthReq = {
    ...mockReq,
    user: {
      sub: '1',
      sessionId: 'sess-1',
      email: 'test@chinhnam.vn',
      deviceInfo: 'Jest-Agent',
    },
  } as unknown as Request & {
    user: {
      sub: string;
      sessionId: string;
      email: string;
      deviceInfo: string;
      role?: string;
    };
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('register()', () => {
    const dto = {
      email: 'test@chinhnam.vn',
      password: 'pw',
      fullName: 'Test',
    };

    it('✅ Correct: Should call service.register and format response', async () => {
      mockAuthService.register.mockResolvedValue({ id: '1' });
      const result = await controller.register(dto);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result.data.id).toBe('1');
    });

    it('❌ Wrong 1: Should bubble up ConflictException for existing email', async () => {
      mockAuthService.register.mockRejectedValue(new ConflictException());
      await expect(controller.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login()', () => {
    const dto = { email: 'test@test.com', password: 'password' };

    it('✅ Correct: Should extract user-agent and pass to service', async () => {
      mockAuthService.login.mockResolvedValue({ accessToken: 'token' });
      const result = await controller.login(dto, mockReq);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto, 'Jest-Agent');
      expect(result.data.accessToken).toBe('token');
    });

    it('✅ Correct: Should fallback to Unknown Device if user-agent missing', async () => {
      mockAuthService.login.mockResolvedValue({});
      await controller.login(dto, { headers: {} } as Request);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto, 'Unknown Device');
    });

    it('❌ Wrong 1: Should bubble up UnauthorizedException from service', async () => {
      mockAuthService.login.mockRejectedValue(new UnauthorizedException());
      await expect(controller.login(dto, mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('googleLogin()', () => {
    const profile = {
      email: 'google@test.com',
      name: 'Google',
      picture: '',
    } as GoogleLoginDto;

    it('✅ Correct: Should pass profile and device info to service', async () => {
      mockAuthService.googleLogin.mockResolvedValue({ accessToken: 'token' });
      await controller.googleLogin(profile, mockReq);
      expect(mockAuthService.googleLogin).toHaveBeenCalledWith(
        profile,
        'Jest-Agent',
      );
    });
  });

  describe('forgotPassword()', () => {
    const dto = { email: 'test@test.com', channel: 'email' as const };

    it('✅ Correct: Should trigger forgot password in service', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);
      await controller.forgotPassword(dto);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
        'test@test.com',
        'email',
      );
    });

    it('❌ Wrong 1: Should bubble up BadRequestException if Zalo lacks phone number', async () => {
      mockAuthService.forgotPassword.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(controller.forgotPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resetPassword()', () => {
    const dto = { email: 't@t.com', otp: '123456', newPassword: 'new' };

    it('✅ Correct: Should pass reset request to service', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);
      await controller.resetPassword(dto);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    });

    it('❌ Wrong 1: Should bubble up BadRequestException for invalid OTP', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid OTP'),
      );
      await expect(controller.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 2: Should bubble up BadRequestException for missing user', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid request'),
      );
      await expect(controller.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 3: Should bubble up InternalServerErrorException on DB crash', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(controller.resetPassword(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('refreshToken()', () => {
    it('✅ Correct: Should call service.refreshToken', async () => {
      mockAuthService.refreshToken.mockResolvedValue({ accessToken: 'new' });
      const result = await controller.refreshToken('old-token');
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('old-token');
      expect(result.data.accessToken).toBe('new');
    });

    it('❌ Wrong 1: Should bubble up UnauthorizedException on invalid token', async () => {
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException(),
      );
      await expect(controller.refreshToken('bad')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getMe()', () => {
    it('✅ Correct: Should parse refresh query to boolean and extract user sub', async () => {
      mockAuthService.getMe.mockResolvedValue({ id: '1' });
      await controller.getMe(mockAuthReq, 'true');
      expect(mockAuthService.getMe).toHaveBeenCalledWith('1', true); // parsed 'true'
    });

    it('✅ Correct: Should fallback to forceRefresh = false', async () => {
      mockAuthService.getMe.mockResolvedValue({ id: '1' });
      await controller.getMe(mockAuthReq);
      expect(mockAuthService.getMe).toHaveBeenCalledWith('1', false);
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if user missing', async () => {
      mockAuthService.getMe.mockRejectedValue(new NotFoundException());
      await expect(controller.getMe(mockAuthReq)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('logout()', () => {
    it('✅ Correct: Should call service logout with userId and sessionId', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      await controller.logout(mockAuthReq);
      expect(mockAuthService.logout).toHaveBeenCalledWith('1', 'sess-1');
    });
  });
  // =====================================================================
  // METHOD: session & token management
  // =====================================================================

  describe('changePassword()', () => {
    const dto = { oldPassword: 'old', newPassword: 'new' };

    it('✅ Correct: Should call changePassword with userId', async () => {
      mockAuthService.changePassword.mockResolvedValue(undefined);
      await controller.changePassword(mockAuthReq, dto);
      expect(mockAuthService.changePassword).toHaveBeenCalledWith('1', dto);
    });

    it('❌ Wrong 1: Should bubble up BadRequestException for wrong old password', async () => {
      mockAuthService.changePassword.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(controller.changePassword(mockAuthReq, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('❌ Wrong 2: Should bubble up NotFoundException if user deleted', async () => {
      mockAuthService.changePassword.mockRejectedValue(new NotFoundException());
      await expect(controller.changePassword(mockAuthReq, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('❌ Wrong 3: Should bubble up InternalServerErrorException on DB failure', async () => {
      mockAuthService.changePassword.mockRejectedValue(
        new InternalServerErrorException(),
      );
      await expect(controller.changePassword(mockAuthReq, dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('sendVerifyOTP()', () => {
    const dto = { channel: 'email' as const };

    it('✅ Correct: Should call sendVerifyOTP with user ID and channel', async () => {
      mockAuthService.sendVerifyOTP.mockResolvedValue(undefined);
      await controller.sendVerifyOTP(mockAuthReq, dto);
      expect(mockAuthService.sendVerifyOTP).toHaveBeenCalledWith('1', 'email');
    });

    it('❌ Wrong 1: Should bubble up BadRequestException if channel Zalo requested but no phone exists', async () => {
      mockAuthService.sendVerifyOTP.mockRejectedValue(
        new BadRequestException(),
      );
      await expect(controller.sendVerifyOTP(mockAuthReq, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyOTP()', () => {
    const dto = { otp: '123456' };

    it('✅ Correct: Should verify OTP with userId', async () => {
      mockAuthService.verifyOTP.mockResolvedValue(undefined);
      await controller.verifyOTP(mockAuthReq, dto);
      expect(mockAuthService.verifyOTP).toHaveBeenCalledWith('1', '123456');
    });

    it('❌ Wrong 1: Should bubble up BadRequestException on incorrect OTP', async () => {
      mockAuthService.verifyOTP.mockRejectedValue(new BadRequestException());
      await expect(controller.verifyOTP(mockAuthReq, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getActiveSessions()', () => {
    it('✅ Correct: Should retrieve active sessions for the user', async () => {
      mockAuthService.getActiveSessions.mockResolvedValue([
        { sessionId: 'sess-1' } as any,
      ]);
      const result = await controller.getActiveSessions(mockAuthReq);
      expect(mockAuthService.getActiveSessions).toHaveBeenCalledWith('1');
      expect(result.data.length).toBe(1);
    });
  });

  describe('revokeDeviceSession()', () => {
    it('✅ Correct: Should revoke specific session by ID', async () => {
      mockAuthService.revokeDeviceSession.mockResolvedValue(undefined);
      await controller.revokeDeviceSession(mockAuthReq, 'target-sess');
      expect(mockAuthService.revokeDeviceSession).toHaveBeenCalledWith(
        '1',
        'target-sess',
      );
    });
  });

  describe('revokeOtherSessions()', () => {
    it('✅ Correct: Should preserve current session and revoke others', async () => {
      mockAuthService.revokeOtherSessions.mockResolvedValue(undefined);
      await controller.revokeOtherSessions(mockAuthReq);
      expect(mockAuthService.revokeOtherSessions).toHaveBeenCalledWith(
        '1',
        'sess-1',
      );
    });
  });

  // =====================================================================
  // ADMIN / HR ROUTES
  // =====================================================================

  describe('adminTriggerPasswordReset()', () => {
    it('✅ Correct: Should trigger reset for targeted user', async () => {
      mockAuthService.adminTriggerPasswordReset.mockResolvedValue(undefined);
      await controller.adminTriggerPasswordReset('target-1');
      expect(mockAuthService.adminTriggerPasswordReset).toHaveBeenCalledWith(
        'target-1',
      );
    });

    it('❌ Wrong 1: Should bubble up NotFoundException if user missing', async () => {
      mockAuthService.adminTriggerPasswordReset.mockRejectedValue(
        new NotFoundException(),
      );
      await expect(
        controller.adminTriggerPasswordReset('target-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminRevokeAllUserSessions()', () => {
    it('✅ Correct: Should clear all sessions for targeted user', async () => {
      mockAuthService.adminRevokeAllUserSessions.mockResolvedValue(undefined);
      await controller.adminRevokeAllUserSessions('target-1');
      expect(mockAuthService.adminRevokeAllUserSessions).toHaveBeenCalledWith(
        'target-1',
      );
    });
  });

  describe('adminVerifyUserEmail()', () => {
    it('✅ Correct: Should manually verify user', async () => {
      mockAuthService.adminVerifyUserEmail.mockResolvedValue(undefined);
      await controller.adminVerifyUserEmail('target-1');
      expect(mockAuthService.adminVerifyUserEmail).toHaveBeenCalledWith(
        'target-1',
      );
    });
  });
});
