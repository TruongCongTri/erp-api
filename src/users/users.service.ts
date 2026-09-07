// src/users/users.service.ts
import {
  Repository,
  In,
  FindOptionsWhere,
  Not,
  IsNull,
  Brackets,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserStatus } from './enums/user-status.enum';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import {
  buildFindOptions,
  buildPaginationMeta,
} from 'src/common/utils/typeorm-query.util';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { CacheService } from 'src/common/cache/cache.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { User } from './entities/users.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

export type UserListResponse = Omit<User, 'bonusPermissions'> & {
  bonusPermsCount: number;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(EmployeeProfile)
    private readonly profileRepository: Repository<EmployeeProfile>,
    private readonly eventEmitter: EventEmitter2,
    readonly cacheService: CacheService,
  ) {}

  // --- STANDARD CRUD WITH AUDIT TRAILS ---
  @CacheClear({
    key: ['users:available', 'users:list:*'],
    isPattern: true,
  })
  async create(
    createData: CreateUserDto,
    adminUser: ActiveUserData,
  ): Promise<User> {
    const user = this.userRepository.create({
      ...createData,
      createdBy: adminUser.id,
      createdByName: adminUser.fullName,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });
    user.passwordHash = await bcrypt.hash(
      createData.password || 'ChinhNam@2026',
      10,
    );
    return this.userRepository.save(user);
  }

  @Cacheable({
    key: (query: unknown) => `users:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: UserQueryDto,
    _bypassCache?: boolean,
  ): Promise<{ data: UserListResponse[]; meta: PaginationMetaDto }> {
    const customFilters: FindOptionsWhere<User> = {};
    if (query.status) customFilters.status = query.status;
    if (query.roleId) customFilters.role = { id: query.roleId };

    const findOptions = buildFindOptions<User>({
      queryDto: query,
      searchableColumns: ['fullName', 'email'],
      sortableColumns: ['fullName', 'email', 'status', 'createdAt'],
      defaultSort: 'createdAt',
      customFilters,
    });

    findOptions.relations = {
      role: true,
      profile: true,
      bonusPermissions: true,
    };

    findOptions.select = {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      status: true,
      createdAt: true,
      createdBy: true,
      updatedAt: true,
      updatedBy: true,
      deletedAt: true,
      deletedBy: true,
      role: { id: true, name: true },
      profile: { employeeCode: true, jobTitle: true, phoneNumber: true },
      bonusPermissions: { id: true },
    };

    const repo: Repository<User> = this.userRepository;
    const [items, total] = await repo.findAndCount(findOptions);

    const mappedItems: UserListResponse[] = items.map((user) => {
      const { bonusPermissions, ...rest } = user;
      return {
        ...rest,
        bonusPermsCount: bonusPermissions?.length || 0,
      };
    });

    return {
      data: mappedItems,
      meta: buildPaginationMeta(query, total),
    };
  }

  @Cacheable({
    key: (id: unknown) => `user:${id as string}`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async findOne(id: string, _bypassCache?: boolean): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        role: true,
        bonusPermissions: true,
        profile: { identityCard: true },
        avatars: true,
      },
    });
    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );
    return user;
  }

  // ==========================================
  // EMPLOYEE UI PROFILES & SENSITIVE DATA
  // ==========================================

  // UI Flow: Quick Drawer (Optimized & Safe)
  @Cacheable({
    key: (id: unknown) => `user:${id as string}:quick-profile`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async getQuickProfile(id: string, _bypassCache?: boolean) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        status: true,
        profile: {
          employeeCode: true,
          jobTitle: true,
          phoneNumber: true,
        },
        role: { id: true, name: true },
      },
      relations: { profile: true, role: true },
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );
    return user;
  }

  // UI Flow: Extensive Page View (Masks Sensitive Data)
  @Cacheable({
    key: (id: unknown) => `user:${id as string}:full-profile`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async getFullProfile(id: string, _bypassCache?: boolean) {
    const user = await this.userRepository.findOne({
      where: { id },
      // Deep fetch the identity card relation so the FE knows it exists
      relations: { profile: { identityCard: true }, role: true, avatars: true },
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );

    // 🛡️ HARD MASK SENSITIVE DATA BEFORE RETURNING
    if (user.profile) {
      if (user.profile.taxCode) user.profile.taxCode = '***';
      if (user.profile.socialInsuranceNumber)
        user.profile.socialInsuranceNumber = '***';

      if (user.profile.identityCard) {
        if (user.profile.identityCard.cccdNumber)
          user.profile.identityCard.cccdNumber = '***';
        if (user.profile.identityCard.personalIdentification)
          user.profile.identityCard.personalIdentification = '***';
        // You can choose to leave dates/locations visible or mask them as well
      }
    }

    return user;
  }

  // Helper: Verifies the manager's password securely
  private async verifyRequesterPassword(
    requesterId: string,
    passwordAttempt: string,
  ) {
    const admin = await this.userRepository.findOne({
      where: { id: requesterId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!admin || !admin.passwordHash) {
      throw new UnauthorizedException(MESSAGES.ERROR.AUTH.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(passwordAttempt, admin.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Mật khẩu xác nhận không chính xác.');
    }
  }

  // UI Flow: Step-Up Auth for CCCD/Identity
  async unlockIdentityData(
    targetUserId: string,
    passwordDto: { password: string },
    requester: ActiveUserData,
  ) {
    await this.verifyRequesterPassword(requester.id, passwordDto.password);

    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { profile: { identityCard: true } },
    });

    if (
      !targetUser ||
      !targetUser.profile ||
      !targetUser.profile.identityCard
    ) {
      throw new NotFoundException(
        'Dữ liệu CCCD không tồn tại cho nhân viên này.',
      );
    }

    // Optional: await this.auditService.logSensitiveAccess(requester.id, targetUserId, 'IDENTITY');

    return targetUser.profile.identityCard;
  }

  // UI Flow: Step-Up Auth for Financial/Tax
  async unlockFinancialData(
    targetUserId: string,
    passwordDto: { password: string },
    requester: ActiveUserData,
  ) {
    await this.verifyRequesterPassword(requester.id, passwordDto.password);

    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { profile: true },
    });

    if (!targetUser || !targetUser.profile) {
      throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    }

    // Optional: await this.auditService.logSensitiveAccess(requester.id, targetUserId, 'FINANCIAL');

    return {
      taxCode: targetUser.profile.taxCode || null,
      socialInsuranceNumber: targetUser.profile.socialInsuranceNumber || null,
    };
  }

  // ==========================================
  // UPDATES & AUDIT
  // ==========================================

  @CacheClear({
    key: (id: unknown) => [
      `user:${id as string}`,
      `user:${id as string}:quick-profile`,
      `user:${id as string}:full-profile`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async update(
    id: string,
    dto: UpdateUserDto,
    adminUser: ActiveUserData,
  ): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    user.updatedBy = adminUser.id;
    user.updatedByName = adminUser.fullName;

    const savedUser = await this.userRepository.save(user);

    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
    }
    return savedUser;
  }

  @CacheClear({
    key: (id: unknown) => [
      `user:${id as string}`,
      `user:${id as string}:perms`,
      `user:${id as string}:quick-profile`,
      `user:${id as string}:full-profile`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async remove(id: string, adminUser: ActiveUserData): Promise<void> {
    const user = await this.findOne(id);

    user.status = UserStatus.RESIGNED;
    user.role = null as unknown as Role;
    user.bonusPermissions = [];
    user.deletedBy = adminUser.id;
    user.deletedByName = adminUser.fullName;

    await this.userRepository.save(user);
    await this.userRepository.softRemove(user);

    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
      await this.cacheService.delPattern(`user:${id}:*`);
    }
  }

  // ==========================================
  // RECYCLE BIN & ACCESS MANAGEMENT
  // ==========================================

  @Cacheable({
    key: 'users:available',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800,
  })
  async findAvailable(_bypassCache?: boolean): Promise<Partial<User>[]> {
    return this.userRepository.find({
      select: { id: true, fullName: true, email: true },
      where: { status: UserStatus.ACTIVE },
      order: { fullName: 'ASC' },
    });
  }

  @Cacheable({
    key: (id: unknown) => `user:${id as string}:access-details`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async getUserAccessDetails(id: string, _bypassCache?: boolean) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        status: true,
      },
      relations: {
        role: { permissions: true },
        bonusPermissions: true,
      },
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, id),
      );

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      role: user.role,
      bonusPermissions: user.bonusPermissions,
      bonusPermissionIds: user.bonusPermissions?.map((p) => p.id) || [],
    };
  }

  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}`,
      `user:${userId as string}:perms`,
      `user:${userId as string}:access-details`,
      'users:list:*',
    ],
    isPattern: true,
  })
  async updateUserAccess(
    userId: string,
    roleId: string,
    bonusPermissionIds: string[],
    adminUser: ActiveUserData,
  ): Promise<User> {
    const user = await this.findOne(userId);

    if (roleId) {
      const role = await this.roleRepository.findOne({
        where: { id: roleId, isLive: true },
      });
      if (!role) throw new BadRequestException(MESSAGES.ERROR.ROLE.UNAVAILABLE);
      user.role = role;
    }

    if (bonusPermissionIds && bonusPermissionIds.length > 0) {
      user.bonusPermissions = await this.permissionRepository.find({
        where: { id: In(bonusPermissionIds), isLive: true },
      });
    } else {
      user.bonusPermissions = [];
    }

    user.updatedBy = adminUser.id;
    user.updatedByName = adminUser.fullName;
    const savedUser = await this.userRepository.save(user);

    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
      await this.cacheService.del(`user:${userId}:access-details`);
      await this.cacheService.del(`user:${userId}:perms`);
    }

    return savedUser;
  }

  @Cacheable({
    key: 'users:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 3600,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<User[]> {
    return this.userRepository.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      order: { deletedAt: 'DESC' },
    });
  }

  @CacheClear({
    key: (id: unknown) => [
      `user:${id as string}`,
      'users:available',
      'users:list:*',
      'users:recycle-bin',
    ],
    isPattern: true,
  })
  async restore(id: string, adminUser: ActiveUserData): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, id),
      );
    if (!user.deletedAt)
      throw new BadRequestException('User is not in the recycle bin.');

    user.deletedAt = null;
    user.deletedBy = null;
    user.deletedByName = null;
    user.updatedBy = adminUser.id;
    user.updatedByName = adminUser.fullName;
    user.status = UserStatus.ACTIVE;

    const savedUser = await this.userRepository.save(user);

    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
    }

    return savedUser;
  }

  // ==========================================
  // PROFILE CLAIM WORKFLOW (HR APPROVAL)
  // ==========================================

  // 1. Worker requests to claim an Employee Code
  @CacheClear({
    key: (id: unknown) => [
      `user:${id as string}*`, // Clears all specific user caches
      'users:list:*', // Clears tables so HR sees the pending request
      'users:claims:pending:*',
    ],
    isPattern: true,
  })
  async submitProfileClaim(userId: string, dto: { employeeCode: string }) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });

    if (!user) throw new UnauthorizedException('Không tìm thấy tài khoản.');
    if (user.profile)
      throw new BadRequestException(
        'Tài khoản này đã được liên kết với một hồ sơ.',
      );

    // Find the requested profile
    const profile = await this.profileRepository.findOne({
      where: { employeeCode: dto.employeeCode },
      relations: { user: true },
    });

    if (!profile)
      throw new NotFoundException(
        `Mã nhân viên ${dto.employeeCode} không tồn tại.`,
      );
    if (!profile.isLive) {
      throw new BadRequestException(
        'Hồ sơ này đã bị khóa hoặc vô hiệu hóa. Vui lòng liên hệ HR.',
      );
    }
    if (profile.user)
      throw new BadRequestException(
        'Hồ sơ này đã được nhận bởi một nhân viên khác.',
      );

    // Link them temporarily and set status to await HR approval
    profile.user = user;
    await this.profileRepository.save(profile);

    // Fire Event: Tell HR someone is claiming a profile
    this.eventEmitter.emit('profile.claim.submitted', {
      requesterId: user.id,
      requesterName: user.fullName,
      employeeCode: dto.employeeCode,
    });

    console.log(`User ${user.id} request to claim profile ${dto.employeeCode}`);

    return {
      message:
        'Yêu cầu liên kết hồ sơ đã được gửi. Vui lòng đợi quản lý phê duyệt.',
      status: UserStatus.PENDING_APPROVAL,
    };
  }

  // 2. HR gets all pending claims for the dashboard
  @Cacheable({
    key: (query: unknown) => `users:claims:pending:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async getPendingClaims(query: UserQueryDto, _bypassCache?: boolean) {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .innerJoinAndSelect('user.profile', 'profile') // MUST have a profile linked
      .leftJoinAndSelect('profile.designatedRole', 'designatedRole')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      // Allow GUEST role OR Null role
      .andWhere(
        new Brackets((qb) => {
          qb.where('role.slug = :roleSlug', { roleSlug: 'GUEST' })
            // 👇 FIX: TypeORM safe way to check if a left-joined relation is null
            .orWhere('role.id IS NULL');
        }),
      )
      .orderBy('user.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    console.log(`Found ${total} pending profile claims`);

    return {
      data: items,
      meta: buildPaginationMeta(query, total),
    };
  }

  // 3. HR Approves the claim and assigns the Role
  @CacheClear({
    key: (targetId: unknown) => [
      `user:${targetId as string}*`,
      'users:list:*',
      'users:claims:pending:*',
    ],
    isPattern: true,
  })
  async approveProfileClaim(
    targetUserId: string,
    roleId?: string,
    bonusPermissionIds: string[] = [],
    adminUser?: ActiveUserData,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: {
        role: true,
        profile: {
          designatedRole: true,
          designatedBonusPermissions: true,
        },
      },
    });

    console.log(`Approving userID ${targetUserId}`);
    const isGuestOrNoRole = !user?.role || user.role.slug === 'GUEST';

    if (!user || !user.profile || !isGuestOrNoRole) {
      throw new BadRequestException(
        'Không tìm thấy yêu cầu cần phê duyệt hợp lệ.',
      );
    }

    if (!user.profile.isLive) {
      throw new BadRequestException(
        'Hồ sơ này đang bị vô hiệu hóa. Hãy mở khóa hồ sơ trước khi phê duyệt.',
      );
    }
    // ==========================================
    // THE HYDRATION (MAGIC STEP)
    // ==========================================
    user.status = UserStatus.ACTIVE;

    // 1. Hydrate the Role
    if (user.profile.designatedRole) {
      // Magic: Automatically inherit the role seeded by HR!
      user.role = user.profile.designatedRole;
    } else if (roleId) {
      // Fallback: If HR manually selected a role in the approval modal
      const role = await this.roleRepository.findOne({
        where: { id: roleId, isLive: true },
      });
      if (!role) {
        throw new BadRequestException(
          'Vai trò (Role) không tồn tại hoặc đã bị khóa.',
        );
      }
      user.role = role;
    } else {
      throw new BadRequestException(
        'Hồ sơ này chưa được cấu hình Vai trò (Role) mặc định.',
      );
    }

    // 2. Hydrate the Bonus Permissions
    if (user.profile.designatedBonusPermissions?.length) {
      // Magic: Inherit specific permissions (e.g. CAN_APPROVE_OVERTIME)
      user.bonusPermissions = user.profile.designatedBonusPermissions;
    } else if (bonusPermissionIds?.length) {
      user.bonusPermissions = await this.permissionRepository.find({
        where: { id: In(bonusPermissionIds), isLive: true },
      });
    } else {
      user.bonusPermissions = [];
    }

    // ==========================================
    // SAVE & AUDIT
    // ==========================================
    if (adminUser) {
      user.updatedBy = adminUser.id;
      user.updatedByName = adminUser.fullName;
    }

    const claimedCode = user.profile.employeeCode;
    const savedUser = await this.userRepository.save(user);

    // Safe explicit cache clear
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
      await this.cacheService.delPattern('users:claims:pending:*');
      await this.cacheService.delPattern(`user:${targetUserId}*`);
    }

    // Fire Event: Tell the Worker they were approved
    this.eventEmitter.emit('profile.claim.approved', {
      targetUserId: savedUser.id,
      employeeCode: claimedCode,
    });

    return savedUser;
  }

  // 4. HR Rejects the claim (Worker stays GUEST)
  @CacheClear({
    key: (targetId: unknown) => [
      `user:${targetId as string}*`,
      'users:list:*',
      'users:claims:pending:*',
    ],
    isPattern: true,
  })
  async rejectProfileClaim(targetUserId: string, adminUser: ActiveUserData) {
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { profile: true, role: true }, // 👈 Added role relation
    });

    // Use the new logical definition for "Pending"
    const isGuestOrNoRole = !user?.role || user.role.slug === 'GUEST';

    if (!user || !user.profile || !isGuestOrNoRole) {
      throw new BadRequestException(
        'Không tìm thấy yêu cầu cần phê duyệt hợp lệ.',
      );
    }

    const rejectedCode = user.profile.employeeCode;
    const profileToUnlink = user.profile;

    // Unlink from the Owning side!
    profileToUnlink.user = null;
    await this.profileRepository.save(profileToUnlink);

    user.updatedBy = adminUser.id;
    user.updatedByName = adminUser.fullName;

    await this.userRepository.save(user);

    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('users:list:*');
      await this.cacheService.delPattern('users:claims:pending:*');
      await this.cacheService.delPattern(`user:${targetUserId}*`);
    }

    // Fire Event: Tell the Worker they were rejected
    this.eventEmitter.emit('profile.claim.rejected', {
      targetUserId,
      employeeCode: rejectedCode,
    });
  }
}
