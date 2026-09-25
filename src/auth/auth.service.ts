import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  RegisterDto,
  LoginDto,
  GoogleLoginDto,
  ResetPasswordDto,
  ChangePasswordDto,
  JwtPayload,
} from './dto/auth.dto';
import { User } from 'src/users/entities/users.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';
import { ZaloService } from 'src/common/services/zalo.service';

import { MailService as MService } from 'src/common/services/mail.service';
import { CacheService } from 'src/common/cache/cache.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import * as crypto from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { Role } from 'src/roles/entities/role.entity';
// import { instanceToPlain } from 'class-transformer';

export interface ActiveSession {
  sessionId: string;
  deviceInfo: string;
  rememberMe: boolean;
  lastAccessed: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly zaloService: ZaloService,
    private readonly mService: MService,
    readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  // =====================================
  // CORE AUTHENTICATION
  // =====================================

  // @CacheClear({
  //   key: ['users:available', 'users:list:*'],
  //   isPattern: true, // Wipe lists since a new user was added to the system
  // })
  // async register(dto: RegisterDto): Promise<User> {
  //   const existing = await this.userRepository.findOneBy({ email: dto.email });
  //   if (existing) throw new ConflictException(MESSAGES.ERROR.AUTH.REGISTERED);

  //   // 1. Fetch the default GUEST role from the database
  //   const guestRole = await this.roleRepository.findOneBy({ slug: 'GUEST' });
  //   if (!guestRole) {
  //     throw new InternalServerErrorException(
  //       'System GUEST role is missing. Please run database seeds.',
  //     );
  //   }

  //   const user = this.userRepository.create({
  //     ...dto,
  //     passwordHash: await bcrypt.hash(dto.password, 10),
  //     status: UserStatus.PENDING_VERIFICATION,
  //   });

  //   const savedUser = await this.userRepository.save(user);

  //   // Fire and forget! The NotificationsService will hear this and handle the rest.
  //   // Tell ESLint to ignore the underlying 'any' signature of the emit method
  //   // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  //   this.eventEmitter.emit('user.registered', {
  //     userId: savedUser.id,
  //     email: savedUser.email,
  //     fullName: savedUser.fullName,
  //   });

  //   try {
  //     // Await the OTP sending
  //     await this.sendVerificationEmail(savedUser.id);
  //   } catch (_error) {
  //     // The OTP failed, but the user IS registered.
  //     // We don't want to throw a 500 here. Just log it, and the frontend
  //     // will redirect them to the "Enter OTP" screen where they can click "Resend".
  //     this.logger.warn(
  //       `User ${savedUser.id} registered, but initial OTP failed to send.`,
  //     );
  //   }
  //   return savedUser;
  // }
  @CacheClear({
    key: ['users:available', 'users:list:*'],
    isPattern: true,
  })
  async register(dto: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Index Scan: Kiểm tra trùng email (O(1) Index Unique)
    const existing = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) throw new ConflictException(MESSAGES.ERROR.AUTH.REGISTERED);

    // 2. Fetch GUEST role có sẵn
    const guestRole = await this.roleRepository.findOne({
      where: { slug: 'GUEST' },
      select: { id: true, slug: true },
    });
    if (!guestRole) {
      throw new InternalServerErrorException('System GUEST role is missing.');
    }

    // 3. Khởi tạo tài khoản
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      ...dto,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      role: guestRole,
      status: UserStatus.PENDING_VERIFICATION,
    });

    const savedUser = await this.userRepository.save(user);

    // 3. Fire-and-forget: Bắn event để listener ngầm tự xử lý gửi email ở background
    this.eventEmitter.emit('user.registered', {
      userId: savedUser.id,
      email: savedUser.email,
      fullName: savedUser.fullName,
    });

    // 4. Loại bỏ passwordHash trước khi trả về client
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...sanitizedUser } = savedUser;
    return sanitizedUser;
  }

  /**
   * Listener xử lý tạo token và gửi email kích hoạt ở background
   */
  @OnEvent('user.registered', { async: true })
  async handleUserRegisteredEvent(payload: { userId: string }): Promise<void> {
    try {
      await this.sendVerificationEmail(payload.userId);
    } catch (error: any) {
      this.logger.error(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Background verification email failed for user ${payload.userId}: ${error.message}`,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        error.stack,
      );
    }
  }

  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const token = crypto.randomBytes(32).toString('hex');

    // Lưu token kích hoạt vào Redis cache (TTL 300s = 5 phút, TTL 900s = 15 phút)
    await this.cacheService.set(`verify_token:${userId}`, token, 900);

    // Gửi email qua SMTP
    await this.mailService.sendVerificationLink(user.email, user.id, token);
  }

  /**
   * Đăng nhập chuẩn cục bộ
   * [Tiêu chí 2]: 1 Query duy nhất lấy thông tin đăng nhập và Role
   */
  async login(dto: LoginDto, deviceInfo: string) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Tối ưu Query: 1 QueryBuilder duy nhất kèm role
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .where('LOWER(user.email) = :email', { email: normalizedEmail })
      .getOne();

    if (!user || !user.passwordHash)
      throw new UnauthorizedException(MESSAGES.ERROR.AUTH.INVALID_CREDENTIALS);

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch)
      throw new UnauthorizedException(MESSAGES.ERROR.AUTH.INVALID_CREDENTIALS);

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        success: false,
        status_code: 403,
        message: 'Tài khoản chưa được xác thực email.',
        error_code: 'PENDING_VERIFICATION',
        data: {
          userId: user.id,
          email: user.email,
        },
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        success: false,
        status_code: 401,
        message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
        error_code: 'ACCOUNT_SUSPENDED',
      });
    }

    return this.generateTokensAndSession(
      user,
      deviceInfo,
      undefined,
      dto.rememberMe,
    );
  }

  async googleLogin(profile: GoogleLoginDto, deviceInfo: string) {
    const normalizedEmail = profile.email.trim().toLowerCase();

    let user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      relations: { role: true },
    });

    // 1. FIRST TIME GOOGLE LOGIN
    if (!user) {
      // Fetch the default GUEST role
      const guestRole = await this.roleRepository.findOne({
        where: { slug: 'GUEST' },
        select: { id: true, slug: true },
      });
      if (!guestRole) {
        throw new InternalServerErrorException('System GUEST role is missing.');
      }

      user = this.userRepository.create({
        email: profile.email,
        fullName: profile.name,
        avatarUrl: profile.picture,

        // ENTERPRISE FIX: Generate an impossible hash so local login completely fails
        // until the user explicitly requests a "Forgot Password" reset.
        // passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
        passwordHash: null as unknown as string,

        status: UserStatus.ACTIVE, // UX WIN: Google already verified the email!
        role: guestRole, // Assign baseline dashboard permissions
      });

      user = await this.userRepository.save(user);

      // Clear cache manually since the decorator won't know it's a first-time login dynamically
      await this.cacheService.delPattern('users:list:*');
      await this.cacheService.del('users:available');
    }

    // 2. RETURNING USER
    else {
      // UX WIN: If they registered manually but never clicked the verify email,
      // logging in with Google acts as instant verification.
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        user.status = UserStatus.ACTIVE;
        await this.userRepository.save(user);
      }
      // HARD BLOCK: Stop suspended or resigned users from using Google to bypass bans
      else if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({
          success: false,
          status_code: 401,
          message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
          error_code: 'ACCOUNT_SUSPENDED',
        });
      }

      // Optional UX Polish: If they didn't have an avatar, grab their Google one
      if (!user.avatarUrl && profile.picture) {
        user.avatarUrl = profile.picture;
        await this.userRepository.save(user);
      }
    }

    // 3. GENERATE SESSION
    return this.generateTokensAndSession(
      user,
      deviceInfo,
      undefined,
      profile.rememberMe,
    );
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    // await this.cacheService.del(`session:${userId}:${sessionId}`);
    await this.revokeDeviceSession(userId, sessionId);
  }

  // =========================================================================
  // 2. USER PROFILE & PERMISSIONS (getMe)
  // =========================================================================

  /**
   * Lấy thông tin phiên làm việc và danh sách quyền hợp nhất của người dùng
   * [Tiêu chí 2, 3 & 4]: 1 Single QueryBuilder JOIN, Cache 24h, loại bỏ serialize dư thừa
   */
  // : Promise<Partial<User>>
  // Unified Cache Key! Shares the exact same data payload as UsersService.findOne
  @Cacheable({
    key: (userId: unknown) => `user:${userId as string}`,
    forceRefresh: (_u: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400, // 24 Hours
  })
  async getMe(userId: string, _bypassCache?: boolean) {
    // 1 QueryBuilder duy nhất giải quyết triệt để N+1
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permissions', 'rolePerm')
      .leftJoinAndSelect('user.bonusPermissions', 'bonusPerm')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.id = :userId', { userId })
      .select([
        'user.id',
        'user.email',
        'user.fullName',
        'user.avatarUrl',
        'user.status',
        'user.passwordHash',
        'role.id',
        'role.name',
        'role.slug',
        'role.isLive',
        'rolePerm.id',
        'rolePerm.slug',
        'bonusPerm.id',
        'bonusPerm.slug',
        'profile.id',
        'profile.employeeCode',
        'profile.jobTitle',
        'profile.department',
      ])
      .getOne();
    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );

    const rolePerms =
      user.role?.isLive && user.role.permissions
        ? user.role.permissions.map((p) => p.slug)
        : [];
    const bonusPerms = user.bonusPermissions
      ? user.bonusPermissions.map((p) => p.slug)
      : [];
    const uniquePermissions = Array.from(
      new Set([...rolePerms, ...bonusPerms]),
    );

    const hasPassword = Boolean(user.passwordHash);
    // Tối ưu V8: Loại bỏ passwordHash bằng destructuring
    const { passwordHash: _, ...sanitizedUser } = user;

    return {
      ...sanitizedUser,
      hasPassword, // Flag quan trọng để Frontend render UI
      permissions: uniquePermissions,
    };
  }

  // =====================================
  // 3. PASSWORD MANAGEMENT & RECOVERY
  // =====================================

  async forgotPassword(
    email: string,
    channel: 'email' | 'zalo',
  ): Promise<void> {
    console.log(`Forgot password requested for ${email} via ${channel}`);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
      relations: { profile: true },
    });
    if (!user) return; // Silent return to prevent email enumeration attacks

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cacheService.set(`reset_otp:${user.id}`, otp, 300); // 5 min expiry

    if (channel === 'email') {
      await this.mService.sendVerificationOtp(user.email, otp);
    } else if (channel === 'zalo') {
      // Assuming you added phoneNumber to the User or EmployeeProfile entity
      if (!user.profile?.phoneNumber) {
        throw new BadRequestException(MESSAGES.ERROR.AUTH.ZALO_PHONE_REQUIRED);
      }
      await this.zaloService.sendZnsOtp(user.profile.phoneNumber, otp);
    }
  }

  // async resetPassword(dto: ResetPasswordDto): Promise<void> {
  //   const logger = new Logger('Debug-Reset'); // Temporary logger
  //   logger.log(`1. Reset password requested for: ${dto.email}`);

  //   try {
  //     // Step 1: Find User
  //     const user = await this.userRepository.findOneBy({ email: dto.email });
  //     if (!user) {
  //       logger.warn(`2. FAILED: User not found for email ${dto.email}`);
  //       throw new BadRequestException('Invalid request');
  //     }
  //     logger.log(`2. User found: ${user.id}`);

  //     // Step 2: Check Redis OTP
  //     const storedOtp = await this.cacheService.get<string>(
  //       `reset_otp:${user.id}`,
  //     );
  //     logger.log(`3. Redis OTP: ${storedOtp} | Provided OTP: ${dto.otp}`);

  //     // Force both to be strings and trim whitespace before comparing
  //     if (!storedOtp || String(storedOtp).trim() !== String(dto.otp).trim()) {
  //       logger.warn('3. FAILED: OTP mismatch or expired');
  //       throw new BadRequestException(MESSAGES.ERROR.AUTH.INVALID_OTP);
  //     }

  //     // Step 3: Bcrypt Hashing
  //     if (!dto.newPassword) {
  //       logger.error(
  //         '4. FAILED: dto.newPassword is undefined! Check your frontend payload.',
  //       );
  //     }
  //     user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
  //     logger.log('4. Password hashed successfully');

  //     // Step 4: Save & Cleanup
  //     await this.userRepository.save(user);
  //     logger.log('5. User saved to database');

  //     await this.cacheService.del(`reset_otp:${user.id}`);

  //     // Step 5: Revoke Sessions
  //     await this.adminRevokeAllUserSessions(user.id);
  //     logger.log(`6. Password reset fully successful for user ${user.id}`);
  //   } catch (error) {
  //     logger.error('❌ CRASH DETECTED:', (error as Error)?.message);
  //     throw error; // Re-throw so the frontend still gets the error response
  //   }
  // }
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });
    if (!user) throw new BadRequestException('Yêu cầu không hợp lệ.');

    const storedOtp = await this.cacheService.get<string>(
      `reset_otp:${user.id}`,
    );
    if (!storedOtp || String(storedOtp).trim() !== String(dto.otp).trim()) {
      throw new BadRequestException(MESSAGES.ERROR.AUTH.INVALID_OTP);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.update(user.id, { passwordHash });

    await this.cacheService.del(`reset_otp:${user.id}`);
    await this.cacheService.del(`auth:snapshot:${user.id}`);
    await this.cacheService.del(`user:me:${user.id}`);
    await this.adminRevokeAllUserSessions(user.id);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ isFirstTimeSetup: boolean }> {
    // const user = await this.userRepository.findOne({
    //   where: { id: userId },
    //   select: { id: true, passwordHash: true, email: true },
    // });
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .select(['user.id', 'user.passwordHash'])
      .getOne();

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );

    // TRƯỜNG HỢP 1: Tài khoản đã có mật khẩu trước đó -> Bắt buộc kiểm tra oldPassword
    if (user.passwordHash) {
      if (!dto.oldPassword) {
        throw new BadRequestException(
          'Vui lòng cung cấp mật khẩu cũ để đổi mật khẩu.',
        );
      }

      const isMatch = await bcrypt.compare(dto.oldPassword, user.passwordHash);
      if (!isMatch) {
        throw new BadRequestException(
          MESSAGES.ERROR.AUTH.INCORRECT_OLD_PASSWORD,
        );
      }
    }
    // TRƯỜNG HỢP 2: Tài khoản Google tạo lần đầu (passwordHash is null/empty)
    // -> Cho phép trực tiếp thiết lập password mới (Setup Password)
    const isFirstTimeSetup = !user.passwordHash;
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.update(userId, { passwordHash });

    // Dọn sạch Cache liên quan
    await this.cacheService.del(`auth:snapshot:${userId}`);
    await this.cacheService.del(`user:me:${userId}`);

    return { isFirstTimeSetup };
  }

  // =====================================
  // 4. VERIFICATION & ACTIVATION
  // =====================================

  async sendVerifyOTP(
    userId: string,
    channel: 'email' | 'zalo',
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, email: true },
      relations: { profile: true },
    });
    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await this.cacheService.set(`verify_otp:${userId}`, otp, 300);

      if (channel === 'email') {
        await this.mService.sendVerificationOtp(user.email, otp);
      } else if (channel === 'zalo') {
        // Assuming you added phoneNumber to the User or EmployeeProfile entity
        if (!user.profile?.phoneNumber) {
          throw new BadRequestException(
            MESSAGES.ERROR.AUTH.ZALO_PHONE_REQUIRED,
          );
        }
        await this.zaloService.sendZnsOtp(user.profile.phoneNumber, otp);
      }
    } catch (error) {
      // ❌ If the email/cache fails, log the exact reason to the terminal!
      this.logger.error(
        `Failed to send ${channel} OTP to user ${userId}`,
        error,
      );

      // Throw a controlled error so the frontend knows exactly what happened,
      // instead of a generic 500 Internal Server Error.
      throw new InternalServerErrorException(
        'Tài khoản đã được tạo, nhưng hệ thống không thể gửi mã OTP lúc này. Vui lòng thử lại sau.',
      );
    }
  }
  // async sendVerificationEmail(userId: string): Promise<void> {
  //   const user = await this.userRepository.findOneBy({ id: userId });
  //   if (!user) throw new NotFoundException('User not found');

  //   // Generate a long, secure token instead of a 6-digit number
  //   const token = crypto.randomBytes(32).toString('hex');

  //   try {
  //     // Save to cache for 5 minutes (300 seconds)
  //     await this.cacheService.set(`verify_token:${userId}`, token, 300);

  //     // Call the MailService
  //     await this.mailService.sendVerificationLink(user.email, user.id, token);
  //   } catch (error) {
  //     this.logger.error(`Failed to send verification link to ${userId}`, error);
  //     throw new InternalServerErrorException(
  //       'Hệ thống không thể gửi email kích hoạt lúc này. Vui lòng thử lại sau.',
  //     );
  //   }
  // }

  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true, // Wipes lists because the user's status changed to ACTIVE
  })
  async verifyOTP(userId: string, otp: string): Promise<void> {
    const storedOtp = await this.cacheService.get<string>(
      `verify_otp:${userId}`,
    );
    if (!storedOtp || storedOtp !== otp) {
      throw new BadRequestException(MESSAGES.ERROR.AUTH.INVALID_OTP);
    }

    await this.userRepository.update(userId, { status: UserStatus.ACTIVE });
    await this.cacheService.del(`verify_otp:${userId}`);
    await this.cacheService.del(`auth:snapshot:${userId}`);
    await this.cacheService.del(`user:me:${userId}`);
    // await this.cacheService.delPattern('users:list:*');
  }

  // async verifyEmailToken(userId: string, token: string, deviceInfo: string) {
  //   // 1. Fetch the saved token from Redis/Cache
  //   const cachedToken = await this.cacheService.get<string>(
  //     `verify_token:${userId}`,
  //   );

  //   // 2. Validate token existence and match
  //   if (!cachedToken || cachedToken !== token) {
  //     throw new BadRequestException(
  //       'Mã xác thực không hợp lệ hoặc đã hết hạn.',
  //     );
  //   }

  //   // 3. Fetch the user (INCLUDE relations needed for token generation)
  //   const user = await this.userRepository.findOne({
  //     where: { id: userId },
  //     select: { id: true, email: true, status: true, fullName: true },
  //     relations: { role: true },
  //   });
  //   if (!user) {
  //     throw new NotFoundException(
  //       MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
  //     );
  //   }

  //   // 4. Idempotency Check: If already active, still auto-login since they have a valid token
  //   if (user.status === UserStatus.ACTIVE) {
  //     const session = await this.generateTokensAndSession(user, deviceInfo);
  //     await this.cacheService.del(`verify_token:${userId}`); // Cleanup just in case

  //     return {
  //       alreadyActive: true,
  //       message: 'Tài khoản này đã được kích hoạt trước đó.',
  //       ...session,
  //     };
  //   }

  //   // 5. Activate the user account
  //   user.status = UserStatus.ACTIVE;

  //   // Optional: Audit trail stamp
  //   user.updatedBy = user.id;
  //   user.updatedByName = user.fullName;

  //   await this.userRepository.save(user);

  //   // 6. Delete the token from Cache so it cannot be reused
  //   await this.cacheService.del(`verify_token:${userId}`);

  //   this.logger.log(`User ${user.id} successfully verified their email.`);

  //   // 7. Generate Auto-Login Session
  //   const session = await this.generateTokensAndSession(user, deviceInfo);

  //   return {
  //     alreadyActive: false,
  //     message: 'Xác thực tài khoản thành công. Đang tự động đăng nhập...',
  //     ...session,
  //   };
  // }
  async verifyEmailToken(userId: string, token: string, deviceInfo: string) {
    const cachedToken = await this.cacheService.get<string>(
      `verify_token:${userId}`,
    );

    if (!cachedToken || cachedToken !== token) {
      throw new BadRequestException(
        'Mã xác thực không hợp lệ hoặc đã hết hạn.',
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, email: true, status: true, fullName: true },
      relations: { role: true },
    });
    if (!user) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      user.status = UserStatus.ACTIVE;
      user.updatedBy = user.id;
      user.updatedByName = user.fullName;
      await this.userRepository.save(user);

      await this.cacheService.del(`auth:snapshot:${userId}`);
      await this.cacheService.del(`user:me:${userId}`);
      await this.cacheService.delPattern('users:list:*');
    }

    await this.cacheService.del(`verify_token:${userId}`);
    const session = await this.generateTokensAndSession(user, deviceInfo);

    return {
      message: 'Xác thực tài khoản thành công.',
      ...session,
    };
  }

  async resendVerificationEmailCooldown(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new NotFoundException('Tài khoản không tồn tại.');
    }

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('Tài khoản này đã được xác thực.');
    }

    // Check Redis for the 60-second cooldown
    const cooldown = await this.cacheService.get(`resend_cooldown:${userId}`);
    if (cooldown) {
      throw new BadRequestException(
        'Vui lòng đợi 1 phút trước khi gửi lại email.',
      );
    }

    // Trigger the email generation (Assuming this method exists in your service)
    await this.sendVerificationEmail(userId);

    // Lock the resend function for 60 seconds
    await this.cacheService.set(`resend_cooldown:${userId}`, 'locked', 60);

    return { message: 'Email xác thực đã được gửi lại thành công.' };
  }
  // =====================================
  // SESSION MANAGEMENT
  // =====================================

  // async refreshToken(token: string) {
  //   try {
  //     // 1. Verify and strongly type the payload
  //     const payload = (await this.jwtService.verifyAsync(token, {
  //       secret: process.env.JWT_REFRESH_SECRET,
  //     })) as unknown as JwtPayload;

  //     // 2. Fetch from Redis (comes back as string if you saved it with JSON.stringify)
  //     const sessionRaw = await this.cacheService.get<string>(
  //       `session:${payload.sub}:${payload.sessionId}`,
  //     );

  //     if (!sessionRaw)
  //       throw new UnauthorizedException(MESSAGES.ERROR.AUTH.SESSION_REVOKED);

  //     // 3. Strongly parse the session data
  //     const sessionExists = await this.cacheService.get<ActiveSession>(
  //       `session:${payload.sub}:${payload.sessionId}`,
  //     );

  //     if (!sessionExists)
  //       throw new UnauthorizedException(MESSAGES.ERROR.AUTH.SESSION_REVOKED);

  //     // 4. Fetch the user WITH their role so the payload populates correctly
  //     const user = await this.userRepository.findOne({
  //       where: { id: payload.sub },
  //       relations: { role: { permissions: true } },
  //     });

  //     if (!user)
  //       throw new UnauthorizedException(
  //         MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
  //       );

  //     // 5. Safely extract boolean (ESLint error fixed!)
  //     const isRemembered: boolean = Boolean(
  //       payload.rememberMe ?? sessionExists.rememberMe ?? false,
  //     );

  //     return this.generateTokensAndSession(
  //       user,
  //       payload.deviceInfo,
  //       payload.sessionId,
  //       isRemembered,
  //     );
  //   } catch (_error) {
  //     throw new UnauthorizedException(MESSAGES.ERROR.AUTH.INVALID_REFRESH);
  //   }
  // }
  async refreshToken(token: string) {
    try {
      const payload = (await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_REFRESH_SECRET,
      })) as unknown as JwtPayload;

      const sessionKey = `session:${payload.sub}:${payload.sessionId}`;
      const session = await this.cacheService.get<ActiveSession>(sessionKey);

      if (!session) {
        throw new UnauthorizedException(MESSAGES.ERROR.AUTH.SESSION_REVOKED);
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        select: { id: true, email: true, fullName: true, status: true },
        relations: { role: true },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Tài khoản không hợp lệ.');
      }

      return this.generateTokensAndSession(
        user,
        payload.deviceInfo,
        payload.sessionId,
        Boolean(payload.rememberMe ?? session.rememberMe),
      );
    } catch {
      throw new UnauthorizedException(MESSAGES.ERROR.AUTH.INVALID_REFRESH);
    }
  }
  /**
   * Truy vấn danh sách session qua Set Index (Tránh lệnh KEYS gây nghẽn Redis)
   */
  // async getActiveSessions(userId: string): Promise<ActiveSession[]> {
  //   const keys = await this.cacheService.keys(`session:${userId}:*`);
  //   const sessions = await Promise.all(
  //     keys.map((key) => this.cacheService.get<ActiveSession>(key)),
  //   );
  //   return sessions.filter((s): s is ActiveSession => s !== null);
  // }
  async getActiveSessions(userId: string): Promise<ActiveSession[]> {
    const sessionIds =
      (await this.cacheService.get<string[]>(`user_sessions:${userId}`)) || [];

    if (sessionIds.length === 0) return [];

    const sessions = await Promise.all(
      sessionIds.map((sid) =>
        this.cacheService.get<ActiveSession>(`session:${userId}:${sid}`),
      ),
    );

    // Lọc bỏ session đã tự hết hạn TTL và đồng bộ lại danh sách
    const validSessions = sessions.filter(
      (s): s is ActiveSession => s !== null,
    );
    if (validSessions.length !== sessionIds.length) {
      await this.cacheService.set(
        `user_sessions:${userId}`,
        validSessions.map((s) => s.sessionId),
        7 * 24 * 3600,
      );
    }

    return validSessions;
  }

  // async revokeDeviceSession(userId: string, sessionId: string): Promise<void> {
  //   await this.cacheService.del(`session:${userId}:${sessionId}`);
  // }

  // async revokeOtherSessions(
  //   userId: string,
  //   currentSessionId: string,
  // ): Promise<void> {
  //   const keys = await this.cacheService.keys(`session:${userId}:*`);
  //   const keysToDelete = keys.filter(
  //     (key) => !key.endsWith(`:${currentSessionId}`),
  //   );

  //   if (keysToDelete.length > 0) {
  //     await Promise.all(keysToDelete.map((key) => this.cacheService.del(key)));
  //   }
  // }

  // =====================================
  // ADMIN / HR FUNCTIONS
  // =====================================

  async revokeDeviceSession(userId: string, sessionId: string): Promise<void> {
    await this.cacheService.del(`session:${userId}:${sessionId}`);

    // Xóa sessionId khỏi danh sách active sessions
    const sessionIds =
      (await this.cacheService.get<string[]>(`user_sessions:${userId}`)) || [];
    const updatedIds = sessionIds.filter((id) => id !== sessionId);
    await this.cacheService.set(
      `user_sessions:${userId}`,
      updatedIds,
      7 * 24 * 3600,
    );
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    const sessionIds =
      (await this.cacheService.get<string[]>(`user_sessions:${userId}`)) || [];
    const idsToDelete = sessionIds.filter((id) => id !== currentSessionId);

    if (idsToDelete.length > 0) {
      await Promise.all(
        idsToDelete.map((id) =>
          this.cacheService.del(`session:${userId}:${id}`),
        ),
      );
      await this.cacheService.set(
        `user_sessions:${userId}`,
        [currentSessionId],
        7 * 24 * 3600,
      );
    }
  }

  async adminTriggerPasswordReset(userId: string): Promise<void> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );
    await this.forgotPassword(user.email, 'email');
  }

  // async adminRevokeAllUserSessions(userId: string): Promise<void> {
  //   await this.cacheService.delPattern(`session:${userId}:*`);
  // }
  async adminRevokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds =
      (await this.cacheService.get<string[]>(`user_sessions:${userId}`)) || [];

    if (sessionIds.length > 0) {
      await Promise.all(
        sessionIds.map((id) =>
          this.cacheService.del(`session:${userId}:${id}`),
        ),
      );
    }

    await this.cacheService.del(`user_sessions:${userId}`);
    await this.cacheService.del(`auth:snapshot:${userId}`);
  }

  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async adminVerifyUserEmail(userId: string): Promise<void> {
    await this.userRepository.update(userId, { status: UserStatus.ACTIVE });
  }

  // =====================================
  // 6. UTILITIES & TOKEN GENERATION
  // =====================================

  // private async generateTokensAndSession(
  //   user: User,
  //   deviceInfo: string,
  //   existingSessionId?: string,
  //   rememberMe: boolean = false,
  // ) {
  //   // Prefer crypto.randomUUID() over Math.random() for secure collision-free IDs
  //   const sessionId = existingSessionId || crypto.randomUUID();

  //   const payload = {
  //     sub: user.id,
  //     email: user.email,
  //     role: user.role?.slug,
  //     sessionId,
  //     deviceInfo,
  //     rememberMe,
  //   };

  //   // Access Token is always short-lived
  //   const accessToken = await this.jwtService.signAsync(payload, {
  //     expiresIn: (process.env.JWT_EXPIRES_IN ||
  //       '15m') as JwtSignOptions['expiresIn'],
  //   });

  //   // Refresh Token adapts to the rememberMe choice
  //   const refreshExpiresIn = rememberMe
  //     ? process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  //     : '1d';

  //   const refreshToken = await this.jwtService.signAsync(payload, {
  //     secret: process.env.JWT_REFRESH_SECRET,
  //     expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
  //   });

  //   // Dynamic Redis TTL matches the token lifespan
  //   const ttlSeconds = rememberMe ? 7 * 24 * 60 * 60 : 1 * 24 * 60 * 60;

  //   const sessionData: ActiveSession = {
  //     sessionId,
  //     deviceInfo,
  //     rememberMe, // Save preference in Redis
  //     lastAccessed: new Date().toISOString(),
  //   };

  //   await this.cacheService.set(
  //     `session:${user.id}:${sessionId}`,
  //     sessionData,
  //     ttlSeconds,
  //   );

  //   return {
  //     accessToken,
  //     refreshToken,
  //     user: { id: user.id, email: user.email, fullName: user.fullName },
  //   };
  // }
  private async generateTokensAndSession(
    user: User,
    deviceInfo: string,
    existingSessionId?: string,
    rememberMe = false,
  ) {
    const sessionId = existingSessionId || crypto.randomUUID();

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role?.slug,
      sessionId,
      deviceInfo,
      rememberMe,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: (process.env.JWT_EXPIRES_IN ||
        '15m') as JwtSignOptions['expiresIn'],
    });

    const refreshExpiresIn = rememberMe
      ? process.env.JWT_REFRESH_EXPIRES_IN || '7d'
      : '1d';

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
    });

    const ttlSeconds = rememberMe ? 7 * 24 * 60 * 60 : 1 * 24 * 60 * 60;

    const sessionData: ActiveSession = {
      sessionId,
      deviceInfo,
      rememberMe,
      lastAccessed: new Date().toISOString(),
    };

    // 1. Lưu chi tiết session
    await this.cacheService.set(
      `session:${user.id}:${sessionId}`,
      sessionData,
      ttlSeconds,
    );

    // 2. Đăng ký sessionId vào danh sách active sessions của người dùng
    const activeSessions =
      (await this.cacheService.get<string[]>(`user_sessions:${user.id}`)) || [];
    if (!activeSessions.includes(sessionId)) {
      activeSessions.push(sessionId);
      await this.cacheService.set(
        `user_sessions:${user.id}`,
        activeSessions,
        7 * 24 * 3600,
      );
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role?.slug,
      },
    };
  }
}
