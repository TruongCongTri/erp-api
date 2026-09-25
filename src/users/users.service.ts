// src/users/users.service.ts
import { Repository, In, Not, IsNull, Brackets } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserStatus } from './enums/user-status.enum';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { buildPaginationMeta } from 'src/common/utils/typeorm-query.util';
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
import { Department } from 'src/departments/entities/department.entity';

export interface UserListResponse {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  role?: { id: string; name: string } | null;
  department?: { id: string; name: string; code: string } | null;
  profile?: {
    employeeCode: string;
    jobTitle: string;
    phoneNumber?: string;
  } | null;
  bonusPermsCount: number;
}

interface UserRawCount {
  bonusPermsCount?: string | number;
}

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
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
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
    const emailExists = await this.userRepository.exists({
      where: { email: createData.email.toLowerCase().trim() },
    });
    if (emailExists) {
      throw new ConflictException(
        MESSAGES.ERROR.ALREADY_EXISTS(
          RESOURCES.USER.BASE,
          'Email',
          createData.email,
        ),
      );
    }
    const user = this.userRepository.create({
      ...createData,
      email: createData.email.toLowerCase().trim(),
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
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    // 1. TRIỆT TIÊU CARTESIAN PRODUCT:
    // Dùng subquery đếm quyền thưởng trực tiếp, không join mảng M-N vào RAM
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .leftJoin('user.department', 'dept')
      .leftJoin('user.profile', 'profile')
      .select([
        'user.id',
        'user.fullName',
        'user.email',
        'user.avatarUrl',
        'user.status',
        'user.createdAt',
        'user.updatedAt',
        'role.id',
        'role.name',
        'dept.id',
        'dept.name',
        'dept.code',
        'profile.employeeCode',
        'profile.jobTitle',
        'profile.phoneNumber',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(ubp.permission_id)', 'bonusPermsCount')
          .from('user_bonus_permissions', 'ubp')
          .where('ubp.user_id = user.id');
      }, 'bonusPermsCount');

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    if (query.roleId) {
      qb.andWhere('user.role_id = :roleId', { roleId: query.roleId });
    }

    if (query.search?.trim()) {
      qb.andWhere('(user.fullName ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`user.${sortField}`, sortOrder);

    qb.skip(skip).take(limit);

    const [rawEntities, total] = await Promise.all([
      qb.getRawAndEntities<UserRawCount>(),
      qb.getCount(),
    ]);

    const mappedItems: UserListResponse[] = rawEntities.entities.map(
      (entity, index) => {
        const raw = rawEntities.raw[index];
        return {
          id: entity.id,
          fullName: entity.fullName,
          email: entity.email,
          avatarUrl: entity.avatarUrl,
          status: entity.status,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          role: entity.role
            ? { id: entity.role.id, name: entity.role.name }
            : null,
          department: entity.department
            ? {
                id: entity.department.id,
                name: entity.department.name,
                code: entity.department.code,
              }
            : null,
          profile: entity.profile
            ? {
                employeeCode: entity.profile.employeeCode,
                jobTitle: entity.profile.jobTitle,
                phoneNumber: entity.profile.phoneNumber,
              }
            : null,
          bonusPermsCount: Number(raw?.bonusPermsCount ?? 0),
        };
      },
    );

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
    // 2. Selective Projection: Không load avatar history hay toàn bộ quan hệ nặng
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        status: true,
        organizationId: true,
        departmentId: true,
        createdAt: true,
        updatedAt: true,
        role: { id: true, name: true, slug: true },
        department: { id: true, name: true, code: true },
        profile: { employeeCode: true, jobTitle: true, phoneNumber: true },
      },
      relations: { role: true, department: true, profile: true },
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
        department: { id: true, name: true, code: true },
        profile: {
          employeeCode: true,
          jobTitle: true,
          phoneNumber: true,
        },
        role: { id: true, name: true },
      },
      relations: { profile: true, role: true, department: true },
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
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        status: true,
        organizationId: true,
        departmentId: true,
        createdAt: true,
        role: { id: true, name: true, slug: true },
        department: { id: true, name: true, code: true },
        profile: {
          id: true,
          employeeCode: true,
          jobTitle: true,
          phoneNumber: true,
          gender: true,
          dateOfBirth: true,
          joinDate: true,
          permanentAddress: true,
          temporaryAddress: true,
          identityCard: {
            id: true,
            cccdLastFour: true, // Khớp với entity CitizenIdentityCard
            fullName: true,
            dateOfExpiry: true,
            status: true,
          },
          financial: {
            id: true,
            taxCodeEncrypted: true, // Khớp với entity EmployeeFinancial
            socialInsuranceNumberEncrypted: true,
          },
        },
      },
      relations: {
        profile: {
          identityCard: true,
          financial: true,
        },
        role: true,
        department: true,
      },
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE),
      );

    // Định dạng dữ liệu hiển thị an toàn (Masked View) cho Frontend
    if (user.profile) {
      if (user.profile.financial) {
        // Che mờ chuỗi ciphertext trước khi gửi về client
        if (user.profile.financial.taxCodeEncrypted) {
          user.profile.financial.taxCodeEncrypted = '***';
        }
        if (user.profile.financial.socialInsuranceNumberEncrypted) {
          user.profile.financial.socialInsuranceNumberEncrypted = '***';
        }
      }

      // cccdLastFour (ví dụ: "1234") được dùng trực tiếp để hiển thị: "***-***-1234"
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

    if (!admin?.passwordHash) {
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

    // const targetUser = await this.userRepository.findOne({
    //   where: { id: targetUserId },
    //   relations: { profile: { identityCard: true } },
    // });

    // if (
    //   !targetUser ||
    //   !targetUser.profile ||
    //   !targetUser.profile.identityCard
    // ) {
    //   throw new NotFoundException(
    //     'Dữ liệu CCCD không tồn tại cho nhân viên này.',
    //   );
    // }

    // // Optional: await this.auditService.logSensitiveAccess(requester.id, targetUserId, 'IDENTITY');

    // return targetUser.profile.identityCard;
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
      select: {
        id: true,
        profile: {
          id: true,
          identityCard: {
            id: true,
            cccdNumberEncrypted: true, // Khớp với schema mới
            cccdLastFour: true,
            personalIdentificationEncrypted: true, // Khớp với schema mới
            fullName: true,
            dateOfBirth: true,
            gender: true,
            nationality: true,
            ethnicity: true,
            religion: true,
            placeOfOrigin: true,
            placeOfResidence: true,
            temporaryAddress: true,
            dateOfIssue: true,
            dateOfExpiry: true,
            placeOfIssue: true,
            status: true,
          },
        },
      },
      relations: { profile: { identityCard: true } },
    });
    if (!targetUser?.profile?.identityCard) {
      throw new NotFoundException(
        'Dữ liệu CCCD không tồn tại cho nhân viên này.',
      );
    }

    return targetUser.profile.identityCard;
  }

  // UI Flow: Step-Up Auth for Financial/Tax
  async unlockFinancialData(
    targetUserId: string,
    passwordDto: { password: string },
    requester: ActiveUserData,
  ) {
    await this.verifyRequesterPassword(requester.id, passwordDto.password);

    // const targetUser = await this.userRepository.findOne({
    //   where: { id: targetUserId },
    //   relations: { profile: true },
    // });

    // if (!targetUser || !targetUser.profile) {
    //   throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    // }
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
      select: {
        id: true,
        profile: {
          id: true,
          employeeCode: true,
          financial: {
            id: true,
            profileId: true,
            taxCodeEncrypted: true, // Khớp với entity EmployeeFinancial
            socialInsuranceNumberEncrypted: true, // Khớp với entity EmployeeFinancial
          },
          salaryHistories: {
            id: true,
            profileId: true,
            baseSalaryEncrypted: true, // Khớp với entity EmployeeSalaryHistory
            extraSalaryEncrypted: true,
            currency: true,
            effectiveDate: true,
            note: true,
            isCurrent: true,
          },
        },
      },
      relations: {
        profile: {
          financial: true,
          salaryHistories: true,
        },
      },
    });

    if (!targetUser?.profile) {
      throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    }

    // Sắp xếp lịch sử lương giảm dần theo ngày hiệu lực
    const sortedSalaryHistories = (
      targetUser.profile.salaryHistories || []
    ).sort(
      (a, b) =>
        new Date(b.effectiveDate).getTime() -
        new Date(a.effectiveDate).getTime(),
    );
    return {
      financial: targetUser.profile.financial ?? null,
      salaryHistories: sortedSalaryHistories,
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
    // const user = await this.findOne(id);
    // Object.assign(user, dto);
    // user.updatedBy = adminUser.id;
    // user.updatedByName = adminUser.fullName;

    // const savedUser = await this.userRepository.save(user);

    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    // }
    // return savedUser;
    const userExists = await this.userRepository.exists({ where: { id } });
    if (!userExists) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, id),
      );
    }

    // 3. Update có chủ đích, không load full tree entity vào RAM
    await this.userRepository.update(id, {
      ...dto,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    return this.findOne(id);
  }

  @CacheClear({
    key: (id: unknown) => [
      `user:${id as string}*`,
      'users:available',
      'users:list:*',
      'users:recycle-bin',
    ],
    isPattern: true,
  })
  async remove(id: string, adminUser: ActiveUserData): Promise<void> {
    // const user = await this.findOne(id);

    // user.status = UserStatus.RESIGNED;
    // user.role = null as unknown as Role;
    // user.bonusPermissions = [];
    // user.deletedBy = adminUser.id;
    // user.deletedByName = adminUser.fullName;

    // await this.userRepository.save(user);
    // await this.userRepository.softRemove(user);

    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    //   await this.cacheService.delPattern(`user:${id}:*`);
    // }
    const userExists = await this.userRepository.exists({ where: { id } });
    if (!userExists) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, id),
      );
    }

    // 4. Update trạng thái và soft-delete trong một chu kỳ
    await this.userRepository.update(id, {
      status: UserStatus.RESIGNED,
      role: null,
      deletedBy: adminUser.id,
      deletedByName: adminUser.fullName,
    });

    // Tách junction table bonus permissions an toàn
    await this.userRepository
      .createQueryBuilder()
      .relation(User, 'bonusPermissions')
      .of(id)
      .set([]);

    await this.userRepository.softDelete(id);
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
    // const user = await this.userRepository.findOne({
    //   where: { id },
    //   select: {
    //     id: true,
    //     fullName: true,
    //     email: true,
    //     avatarUrl: true,
    //     status: true,
    //   },
    //   relations: {
    //     role: { permissions: true },
    //     bonusPermissions: true,
    //   },
    // });
    const user = await this.userRepository.findOne({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        status: true,
        role: { id: true, name: true, slug: true },
        bonusPermissions: { id: true, name: true, slug: true },
      },
      relations: {
        role: true,
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

  // @CacheClear({
  //   key: (userId: unknown) => [
  //     `user:${userId as string}`,
  //     `user:${userId as string}:perms`,
  //     `user:${userId as string}:access-details`,
  //     'users:list:*',
  //   ],
  //   isPattern: true,
  // })

  @CacheClear({
    key: (userId: unknown) => [`user:${userId as string}*`, 'users:list:*'],
    isPattern: true,
  })
  async updateUserAccess(
    userId: string,
    roleId: string,
    bonusPermissionIds: string[],
    adminUser: ActiveUserData,
  ): Promise<User> {
    // const user = await this.findOne(userId);
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, userId),
      );
    }

    if (roleId) {
      const roleExists = await this.roleRepository.exists({
        where: { id: roleId, isLive: true },
      });
      if (!roleExists)
        throw new BadRequestException(MESSAGES.ERROR.ROLE.UNAVAILABLE);
      user.role = { id: roleId } as Role;
    }

    if (bonusPermissionIds?.length) {
      user.bonusPermissions = bonusPermissionIds.map(
        (id) => ({ id }) as Permission,
      );
    } else {
      user.bonusPermissions = [];
    }

    user.updatedBy = adminUser.id;
    user.updatedByName = adminUser.fullName;
    // const savedUser = await this.userRepository.save(user);

    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    //   await this.cacheService.del(`user:${userId}:access-details`);
    //   await this.cacheService.del(`user:${userId}:perms`);
    // }

    return this.userRepository.save(user);
  }

  @Cacheable({
    key: 'users:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 1800,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<User[]> {
    return this.userRepository.find({
      select: {
        id: true,
        fullName: true,
        email: true,
        deletedAt: true,
        deletedByName: true,
      },
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
      select: { id: true, deletedAt: true },
    });

    if (!user)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.USER.BASE, id),
      );
    if (!user.deletedAt)
      throw new BadRequestException('User is not in the recycle bin.');

    // user.deletedAt = null;
    // user.deletedBy = null;
    // user.deletedByName = null;
    // user.updatedBy = adminUser.id;
    // user.updatedByName = adminUser.fullName;
    // user.status = UserStatus.ACTIVE;

    // const savedUser = await this.userRepository.save(user);

    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    // }

    // return savedUser;
    await this.userRepository.restore(id);
    await this.userRepository.update(id, {
      status: UserStatus.ACTIVE,
      deletedBy: null,
      deletedByName: null,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    user.deletedAt = null;
    user.status = UserStatus.ACTIVE;
    return user;
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
      select: { id: true, fullName: true, profile: { id: true } },
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
      select: { id: true, isLive: true, user: { id: true } },
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

    // console.log(`User ${user.id} request to claim profile ${dto.employeeCode}`);

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
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);

    // const queryBuilder = this.userRepository
    //   .createQueryBuilder('user')
    //   .leftJoinAndSelect('user.role', 'role')
    //   .innerJoinAndSelect('user.profile', 'profile') // MUST have a profile linked
    //   .leftJoinAndSelect('profile.designatedRole', 'designatedRole')
    //   .where('user.status = :status', { status: UserStatus.ACTIVE })
    //   // Allow GUEST role OR Null role
    //   .andWhere(
    //     new Brackets((qb) => {
    //       qb.where('role.slug = :roleSlug', { roleSlug: 'GUEST' })
    //         // 👇 FIX: TypeORM safe way to check if a left-joined relation is null
    //         .orWhere('role.id IS NULL');
    //     }),
    //   )
    //   .orderBy('user.updatedAt', 'DESC')
    //   .skip((page - 1) * limit)
    //   .take(limit);
    // 5. Tối ưu Payload: Chỉ select các cột phục vụ xét duyệt, không lộ dữ liệu nhạy cảm
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .innerJoin('user.profile', 'profile')
      .leftJoin('profile.designatedRole', 'designatedRole')
      .select([
        'user.id',
        'user.fullName',
        'user.email',
        'user.avatarUrl',
        'user.updatedAt',
        'role.id',
        'role.name',
        'role.slug',
        'profile.id',
        'profile.employeeCode',
        'profile.jobTitle',
        'designatedRole.id',
        'designatedRole.name',
        'designatedRole.slug',
      ])
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere(
        new Brackets((qb) => {
          qb.where('role.slug = :roleSlug', { roleSlug: 'GUEST' }).orWhere(
            'role.id IS NULL',
          );
        }),
      )
      .orderBy('user.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    // console.log(`Found ${total} pending profile claims`);

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
    departmentId?: string,
  ) {
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: {
        role: true,
        profile: {
          designatedRole: true,
          designatedBonusPermissions: true,
          designatedDepartment: true,
        },
      },
    });

    // console.log(`Approving userID ${targetUserId}`);
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

    // 3. Hydrate the Department & Organization
    if (user.profile.designatedDepartment) {
      // Tự động kế thừa phòng ban và tổ chức từ hồ sơ đã được HR seed/chỉ định
      user.department = user.profile.designatedDepartment;
      user.departmentId = user.profile.designatedDepartment.id;
      user.organizationId =
        user.profile.designatedDepartment.organizationId ?? null;
    } else if (departmentId) {
      // Fallback: Admin chọn phòng ban trực tiếp trên modal phê duyệt
      const dept = await this.departmentRepository.findOne({
        where: { id: departmentId, isActive: true },
      });
      if (!dept) {
        throw new BadRequestException(
          'Phòng ban được chọn không tồn tại hoặc đã bị vô hiệu hóa.',
        );
      }
      user.department = dept;
      user.departmentId = dept.id;
      user.organizationId = dept.organizationId ?? null;
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

    // // Safe explicit cache clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    //   await this.cacheService.delPattern('users:claims:pending:*');
    //   await this.cacheService.delPattern(`user:${targetUserId}*`);
    // }

    // Fire Event: Tell the Worker they were approved
    this.eventEmitter.emit('profile.claim.approved', {
      targetUserId: savedUser.id,
      employeeCode: claimedCode,
      departmentId: savedUser.departmentId,
      organizationId: savedUser.organizationId,
      roleSlug: savedUser.role?.slug,
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
      relations: { profile: true, role: true },
    });

    // Use the new logical definition for "Pending"
    const isGuestOrNoRole = !user?.role || user.role.slug === 'GUEST';
    if (!user?.profile || !isGuestOrNoRole) {
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

    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('users:list:*');
    //   await this.cacheService.delPattern('users:claims:pending:*');
    //   await this.cacheService.delPattern(`user:${targetUserId}*`);
    // }

    // Fire Event: Tell the Worker they were rejected
    this.eventEmitter.emit('profile.claim.rejected', {
      targetUserId,
      employeeCode: rejectedCode,
    });
  }
}
