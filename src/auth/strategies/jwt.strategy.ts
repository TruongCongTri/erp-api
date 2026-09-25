import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'; // Added ForbiddenException
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/users.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';
import { CacheService } from 'src/common/cache/cache.service';
import { AuthUserSnapshot, JwtPayload, JwtUser } from '../dto/auth.dto';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'fallback-super-secret-key',
    });
  }

  // async validate(payload: JwtPayload) {
  //   // 1. Session Revocation Check
  //   const sessionExists = await this.redisClient.get(
  //     `session:${payload.sub}:${payload.sessionId}`,
  //   );

  //   if (!sessionExists) {
  //     throw new UnauthorizedException('Session has been revoked or expired');
  //   }

  //   // 2. Fetch User & Permissions
  //   const user = await this.userRepository.findOne({
  //     where: { id: payload.sub },
  //     relations: {
  //       role: { permissions: true },
  //       bonusPermissions: true,
  //     },
  //   });

  //   if (!user) {
  //     throw new UnauthorizedException('User no longer exists');
  //   }

  //   // --- ACTIONABLE ERROR CODES ---

  //   // 3A. Pending Verification State (403 Forbidden)
  //   if (user.status === UserStatus.PENDING_VERIFICATION) {
  //     throw new ForbiddenException({
  //       success: false,
  //       status_code: 403,
  //       message: 'Tài khoản chưa được xác thực email.',
  //       error_code: 'PENDING_VERIFICATION', // FE catches this
  //       data: {
  //         userId: user.id,
  //         email: user.email,
  //       },
  //     });
  //   }

  //   // 3B. Suspended/Resigned State (401 Unauthorized)
  //   if (user.status !== UserStatus.ACTIVE) {
  //     throw new UnauthorizedException({
  //       success: false,
  //       status_code: 401,
  //       message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
  //       error_code: 'ACCOUNT_SUSPENDED',
  //     });
  //   }

  //   // 4. Extract and combine permissions
  //   const rolePerms = user.role?.isLive
  //     ? user.role.permissions.map((p) => p.slug)
  //     : [];
  //   const bonusPerms = user.bonusPermissions
  //     ? user.bonusPermissions.map((p) => p.slug)
  //     : [];
  //   const uniquePermissions = Array.from(
  //     new Set([...rolePerms, ...bonusPerms]),
  //   );

  //   return {
  //     id: user.id,
  //     sub: user.id,
  //     email: user.email,
  //     fullName: user.fullName,
  //     role: { slug: user.role?.slug || '' },
  //     permissions: uniquePermissions,
  //     sessionId: payload.sessionId,
  //     deviceInfo: payload.deviceInfo,
  //   };
  // }
  async validate(payload: JwtPayload): Promise<JwtUser> {
    // 1. Kiểm tra Session Revocation từ Redis RAM (O(1) lookup)
    const sessionKey = `session:${payload.sub}:${payload.sessionId}`;
    const sessionExists = await this.cacheService.get(sessionKey);

    if (!sessionExists) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
      );
    }

    // 2. [Tối ưu Caching]: Lấy Snapshot thông tin & quyền hạn từ Redis
    const snapshotKey = `auth:snapshot:${payload.sub}`;
    let snapshot = await this.cacheService.get<AuthUserSnapshot>(snapshotKey);

    // 3. [Tối ưu Query - Triệt tiêu N+1]: Chỉ truy vấn CSDL khi Cache Miss
    if (!snapshot) {
      const user = await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.role', 'role')
        .leftJoinAndSelect('role.permissions', 'rolePerm')
        .leftJoinAndSelect('user.bonusPermissions', 'bonusPerm')
        .where('user.id = :id', { id: payload.sub })
        .select([
          'user.id',
          'user.email',
          'user.fullName',
          'user.status',
          'role.id',
          'role.slug',
          'role.isLive',
          'rolePerm.id',
          'rolePerm.slug',
          'bonusPerm.id',
          'bonusPerm.slug',
        ])
        .getOne();

      if (!user) {
        throw new UnauthorizedException(
          'Người dùng không còn tồn tại trên hệ thống.',
        );
      }

      // Trích xuất danh sách permissions duy nhất
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

      snapshot = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        roleSlug: user.role?.slug || '',
        permissions: uniquePermissions,
      };

      // Lưu snapshot vào Redis trong 10 phút (600s)
      await this.cacheService.set(snapshotKey, snapshot, 600);
    }

    // 4. Kiểm tra trạng thái tài khoản
    if (snapshot.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException({
        success: false,
        status_code: 403,
        message: 'Tài khoản chưa được xác thực email.',
        error_code: 'PENDING_VERIFICATION',
        data: {
          userId: snapshot.id,
          email: snapshot.email,
        },
      });
    }

    if (snapshot.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        success: false,
        status_code: 401,
        message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
        error_code: 'ACCOUNT_SUSPENDED',
      });
    }

    // 5. [Tối ưu Payload]: Trả về đối tượng JwtUser gọn nhẹ cho Request Context
    return {
      id: snapshot.id,
      sub: snapshot.id,
      email: snapshot.email,
      fullName: snapshot.fullName,
      role: { slug: snapshot.roleSlug },
      permissions: snapshot.permissions,
      sessionId: payload.sessionId,
      deviceInfo: payload.deviceInfo,
    };
  }
}
