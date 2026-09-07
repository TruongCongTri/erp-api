import Redis from 'ioredis';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'; // Added ForbiddenException
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/users.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
  role?: string;
  sessionId: string;
  deviceInfo: string;
  rememberMe?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'fallback-super-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    // 1. Session Revocation Check
    const sessionExists = await this.redisClient.get(
      `session:${payload.sub}:${payload.sessionId}`,
    );

    if (!sessionExists) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    // 2. Fetch User & Permissions
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: {
        role: { permissions: true },
        bonusPermissions: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // --- ACTIONABLE ERROR CODES ---

    // 3A. Pending Verification State (403 Forbidden)
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        success: false,
        status_code: 403,
        message: 'Tài khoản chưa được xác thực email.',
        error_code: 'PENDING_VERIFICATION', // FE catches this
        data: {
          userId: user.id,
          email: user.email,
        },
      });
    }

    // 3B. Suspended/Resigned State (401 Unauthorized)
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        success: false,
        status_code: 401,
        message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
        error_code: 'ACCOUNT_SUSPENDED',
      });
    }

    // 4. Extract and combine permissions
    const rolePerms = user.role?.isLive
      ? user.role.permissions.map((p) => p.slug)
      : [];
    const bonusPerms = user.bonusPermissions
      ? user.bonusPermissions.map((p) => p.slug)
      : [];
    const uniquePermissions = Array.from(
      new Set([...rolePerms, ...bonusPerms]),
    );

    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: { slug: user.role?.slug || '' },
      permissions: uniquePermissions,
      sessionId: payload.sessionId,
      deviceInfo: payload.deviceInfo,
    };
  }
}
