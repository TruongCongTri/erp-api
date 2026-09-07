import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/entities/users.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { MailService } from 'src/common/services/mail.service';
import { ZaloService } from 'src/common/services/zalo.service';
import { CacheService } from 'src/common/cache/cache.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  // Mock dependencies
  const mockUserRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn<string, unknown[]>(),
    verify: jest.fn<
      { sub: string; sessionId: string; deviceInfo?: string },
      unknown[]
    >(),
  };
  const mockMailService = { sendVerificationOtp: jest.fn() };
  const mockZaloService = { sendZnsOtp: jest.fn() };
  const mockEventEmitter: Record<string, jest.Mock> = {
    emit: jest.fn(),
  };

  const mockCacheService = {
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) =>
      fetcher(),
    ),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn(),
    keys: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
        { provide: ZaloService, useValue: mockZaloService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login()', () => {
    const dto = { email: 'test@test.com', password: 'password' };
    const mockUser = {
      id: '1',
      email: 'test@test.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
    };

    it('✅ Correct: Should verify password and cache session data', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(dto, 'Device');

      expect(result.accessToken).toBe('token');
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('session:1:'),
        expect.any(String),
        604800, // 7 days in seconds
      );
    });

    it('❌ Wrong 1: Should throw Unauthorized if user missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.login(dto, 'Device')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ Wrong 2: Should throw Unauthorized if Google-only account', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        passwordHash: '',
      });
      await expect(service.login(dto, 'Device')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ Wrong 3: Should throw Unauthorized on password mismatch', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login(dto, 'Device')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ Wrong 4: Should throw Unauthorized if RESIGNED', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        status: UserStatus.RESIGNED,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login(dto, 'Device')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('register', () => {
    const dto = {
      email: 'new@test.com',
      password: 'pw123',
      fullName: 'Jane',
    };

    // 🟢 1 HAPPY PATH
    it('✅ Correct: Should create user, emit event, and trigger OTP cache', async () => {
      mockUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: '2', email: dto.email });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockResolvedValue({ id: '2', ...dto });
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.register(dto);

      expect(result.id).toEqual('2');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.any(Object),
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('verify_otp:2'),
        expect.any(String),
        300,
      );
      expect(mockMailService.sendVerificationOtp).toHaveBeenCalled();
    });

    // 🔴 5 SAD PATHS
    it('1. should throw ConflictException if email exists', async () => {
      mockUserRepository.findOneBy.mockResolvedValue({ email: 'new@test.com' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('2. should fail if bcrypt hashing fails', async () => {
      mockUserRepository.findOneBy.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockRejectedValue(new Error('Bcrypt error'));
      await expect(service.register(dto)).rejects.toThrow('Bcrypt error');
    });

    it('3. should fail if database save fails', async () => {
      mockUserRepository.findOneBy.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(service.register(dto)).rejects.toThrow('DB connection lost');
    });

    it('4. should fail if Redis OTP generation fails', async () => {
      mockUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'uuid-2', email: 'new@test.com' }); // Provide user for OTP step

      mockUserRepository.save.mockResolvedValue({ id: 'uuid-2' });
      mockCacheService.set.mockRejectedValue(new Error('Redis outage'));

      await expect(service.register(dto)).rejects.toThrow('Redis outage');
    });

    it('5. should fail if MailService throws an error', async () => {
      mockUserRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'uuid-2', email: 'new@test.com' }); // Provide user for OTP step

      mockUserRepository.save.mockResolvedValue({ id: 'uuid-2' });
      mockCacheService.set.mockResolvedValue(undefined);
      mockMailService.sendVerificationOtp.mockRejectedValue(
        new InternalServerErrorException('SMTP down'),
      );

      await expect(service.register(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('googleLogin()', () => {
    const profile = { email: 'g@test.com', name: 'G', picture: '' };

    it('✅ Correct: Should auto-register first-time Google users and wipe cache', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(profile);
      mockUserRepository.save.mockResolvedValue({ id: '1', ...profile });
      mockJwtService.sign.mockReturnValue('token');

      await service.googleLogin(profile, 'Device');

      // Ensures the manual cache wipe happens for new Google accounts
      expect(mockCacheService.delPattern).toHaveBeenCalledWith('users:list:*');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('✅ Correct: Should log in existing Google users directly', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: '1',
        email: 'g@test.com',
      });
      mockJwtService.sign.mockReturnValue('token');

      await service.googleLogin(profile, 'Device');
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // METHOD: refreshToken()
  // =====================================================================
  describe('refreshToken()', () => {
    it('✅ Correct: Should verify token and existing session before refreshing', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        sessionId: 'sess-1',
        deviceInfo: 'Dev',
      });
      mockCacheService.get.mockResolvedValue('active-session-string');
      mockUserRepository.findOneBy.mockResolvedValue({ id: '1' });
      mockJwtService.sign.mockReturnValue('new-token');

      const result = await service.refreshToken('old-token');
      expect(result.accessToken).toBe('new-token');
    });

    it('❌ Wrong 1: Should throw Unauthorized if JWT verify fails', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error();
      });
      await expect(service.refreshToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('❌ Wrong 2: Should throw Unauthorized if session missing from cache (revoked)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1', sessionId: 'sess-1' });
      mockCacheService.get.mockResolvedValue(null); // Cache Miss
      await expect(service.refreshToken('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =====================================================================
  // METHOD: getMe()
  // =====================================================================
  describe('getMe()', () => {
    it('✅ Correct: Should return user and bypass cache properly', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: '1' });
      await service.getMe('1', true);
      expect(mockUserRepository.findOne).toHaveBeenCalled();
    });

    it('❌ Wrong 1: Should throw NotFoundException if missing', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      await expect(service.getMe('99')).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================================
  // METHOD: resetPassword()
  // =====================================================================
  describe('resetPassword()', () => {
    const dto = { email: 't@t.com', otp: '123456', newPassword: 'new' };

    it('✅ Correct: Should verify OTP from cache, save password, and revoke sessions', async () => {
      mockUserRepository.findOneBy.mockResolvedValue({ id: '1' });
      mockCacheService.get.mockResolvedValue('123456');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      await service.resetPassword(dto);

      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockCacheService.del).toHaveBeenCalledWith('reset_otp:1');
      expect(mockCacheService.delPattern).toHaveBeenCalledWith('session:1:*');
    });

    it('❌ Wrong 1: Should throw BadRequest if OTP does not match cache', async () => {
      mockUserRepository.findOneBy.mockResolvedValue({ id: '1' });
      mockCacheService.get.mockResolvedValue('654321');
      await expect(service.resetPassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
