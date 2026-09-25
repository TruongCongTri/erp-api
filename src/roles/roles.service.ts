// src/roles/roles.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import { Role } from './entities/role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/users.entity';
import { ToggleStatusDto } from 'src/common/dto/toggle-status.dto';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { buildPaginationMeta } from 'src/common/utils/typeorm-query.util';
import { CacheService } from 'src/common/cache/cache.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { FIELDS } from 'src/common/constants/field.constant';
import { ACTIONS } from 'src/common/constants/action.constant';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';

export type RoleWithCounts = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  isLive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  permissionCount: number;
};

interface RoleRawCount {
  userCount?: string | number;
  permissionCount?: string | number;
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    readonly cacheService: CacheService,
  ) {}

  // --- STANDARD CRUD ---
  @CacheClear({
    key: ['roles:available', 'roles:list:*'],
    isPattern: true,
  })
  async create(
    createRoleDto: CreateRoleDto,
    user: ActiveUserData,
  ): Promise<Role> {
    // const existing = await this.roleRepository.findOneBy({
    //   slug: createRoleDto.slug,
    // });
    // 1. Tối ưu: Dùng exists thay vì nạp toàn bộ bản ghi
    const exists = await this.roleRepository.exists({
      where: { slug: createRoleDto.slug },
    });
    if (exists)
      throw new ConflictException(
        MESSAGES.ERROR.ALREADY_EXISTS(
          RESOURCES.ROLE.BASE,
          FIELDS.SLUG,
          createRoleDto.slug,
        ),
      );

    const { permissionIds, ...roleData } = createRoleDto;
    const role = this.roleRepository.create({
      ...roleData,
      createdBy: user.id,
      createdByName: user.fullName,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    // if (permissionIds && permissionIds.length > 0)
    //   role.permissions = await this.permissionRepository.find({
    //     where: { id: In(permissionIds), isLive: true }, // Only assign LIVE perms
    //   });

    if (permissionIds?.length) {
      // Chỉ select ID của permissions để gắn kết foreign key
      role.permissions = await this.permissionRepository.find({
        select: { id: true },
        where: { id: In(permissionIds), isLive: true },
      });
    }

    return this.roleRepository.save(role);
  }

  // @Cacheable({
  //   key: (query: unknown) => `roles:list:${JSON.stringify(query)}`,
  //   forceRefresh: (_query: unknown, bypassCache: unknown) =>
  //     bypassCache === true,
  //   ttlSeconds: 3600,
  // })
  // async findAll(
  //   query: RoleQueryDto,
  //   _bypassCache?: boolean,
  // ): Promise<{ data: RoleWithCounts[]; meta: PaginationMetaDto }> {
  //   const customFilters: FindOptionsWhere<Role> = {};
  //   if (query.isLive !== undefined) {
  //     customFilters.isLive = query.isLive;
  //   }

  //   const findOptions = buildFindOptions<Role>({
  //     queryDto: query,
  //     searchableColumns: ['slug', 'name'],
  //     sortableColumns: ['slug', 'name', 'isLive', 'isDefault', 'updatedAt'],
  //     defaultSort: 'updatedAt',
  //     customFilters,
  //   });

  //   findOptions.relations = { users: true, permissions: true };

  //   const repo: Repository<Role> = this.roleRepository;
  //   const [items, total] = await repo.findAndCount(findOptions);

  //   // Map into a lightweight format with counts for the UI Grid
  //   const mappedItems: RoleWithCounts[] = items.map((entity) => {
  //     const { users, permissions, ...rest } = entity;
  //     return {
  //       ...rest,
  //       userCount: users?.length || 0,
  //       permissionCount: permissions?.length || 0,
  //     };
  //   });

  //   return {
  //     data: mappedItems,
  //     meta: buildPaginationMeta(query, total),
  //   };
  // }
  @Cacheable({
    key: (query: unknown) => `roles:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: RoleQueryDto,
    _bypassCache?: boolean,
  ): Promise<{ data: RoleWithCounts[]; meta: PaginationMetaDto }> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. TRIỆT TIÊU CARTESIAN PRODUCT & MEMORY LEAK:
    // Dùng subqueries tính count trực tiếp trên Index, không tải users/permissions vào RAM Node.js
    const qb = this.roleRepository
      .createQueryBuilder('role')
      .select([
        'role.id',
        'role.slug',
        'role.name',
        'role.isDefault',
        'role.isLive',
        'role.createdAt',
        'role.updatedAt',
      ])
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(u.id)', 'userCount')
          .from(User, 'u')
          .where('u.role_id = role.id');
      }, 'userCount')
      .addSelect((subQuery) => {
        return subQuery
          .select('COUNT(rp.permission_id)', 'permissionCount')
          .from('role_permissions', 'rp')
          .where('rp.role_id = role.id');
      }, 'permissionCount');

    if (query.isLive !== undefined) {
      qb.andWhere('role.isLive = :isLive', { isLive: query.isLive });
    }

    if (query.search) {
      qb.andWhere('(role.slug ILIKE :search OR role.name ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const sortField = query.sortBy || 'updatedAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`role.${sortField}`, sortOrder);

    qb.skip(skip).take(limit);

    const [rawEntities, total] = await Promise.all([
      qb.getRawAndEntities<RoleRawCount>(),
      qb.getCount(),
    ]);

    // Map kết quả thô với số lượng đếm
    const mappedItems: RoleWithCounts[] = rawEntities.entities.map(
      (entity, index) => {
        const raw: RoleRawCount | undefined = rawEntities.raw[index];
        return {
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          isDefault: entity.isDefault,
          isLive: entity.isLive,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          userCount: Number(raw?.userCount ?? 0),
          permissionCount: Number(raw?.permissionCount ?? 0),
        };
      },
    );

    return {
      data: mappedItems,
      meta: buildPaginationMeta(query, total),
    };
  }

  @Cacheable({
    key: (id: unknown) => `role:${id as string}`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async findOne(id: string, _bypassCache?: boolean): Promise<Role> {
    // const role = await this.roleRepository.findOne({
    //   where: { id },
    //   relations: {
    //     permissions: true,
    //   },
    // });
    const role = await this.roleRepository.findOne({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        isDefault: true,
        isLive: true,
        createdAt: true,
        updatedAt: true,
      },
      relations: { permissions: true },
    });
    if (!role)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.ROLE.BASE, id),
      );
    return role;
  }

  @Cacheable({
    key: (id: unknown) => `role:${id as string}`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async getRoleDetails(id: string, _bypassCache?: boolean) {
    // const role = await this.roleRepository.findOne({
    //   where: { id },
    //   relations: { permissions: true, users: { profile: true } }, // Deep fetch the assigned permissions and users with profiles
    // });
    // 3. Tối ưu Payload: Chỉ select các trường cần hiển thị UI, tránh hydrate nặng
    const role = await this.roleRepository.findOne({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        isDefault: true,
        isLive: true,
        createdAt: true,
        updatedAt: true,
        permissions: {
          id: true,
          slug: true,
        },
        users: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          status: true,
          profile: {
            jobTitle: true,
          },
        },
      },
      relations: {
        permissions: true,
        users: { profile: true },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // const plainRole = instanceToPlain(role);

    // Extract just the IDs for the frontend to use in its checkbox state
    const assignedPermissionIds = role.permissions.map((p) => p.id);
    const assignedPermissionSlugs = role.permissions.map((p) => p.slug);

    const assignedUsers =
      role.users?.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        jobTitle: u.profile?.jobTitle || 'N/A', // Safely extract job title
        status: u.status,
      })) || [];

    // return {
    //   ...plainRole,
    //   // We return both IDs (for form submission) and slugs (for easier debugging)
    //   permissionIds: assignedPermissionIds,
    //   permissionSlugs: assignedPermissionSlugs,
    //   // We explicitly remove the heavy array of full permission objects
    //   users: assignedUsers,
    //   permissions: undefined,
    // };
    return {
      id: role.id,
      slug: role.slug,
      name: role.name,
      isDefault: role.isDefault,
      isLive: role.isLive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissionIds: assignedPermissionIds,
      permissionSlugs: assignedPermissionSlugs,
      users: assignedUsers,
    };
  }

  @CacheClear({
    key: (id: unknown) => [
      `role:${id as string}`,
      `role:details:${id as string}`,
      'roles:available',
      'roles:list:*',
      'user:*:perms',
    ],
    isPattern: true,
  })
  async update(
    id: string,
    dto: UpdateRoleDto,
    user: ActiveUserData,
  ): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id },
      select: { id: true, slug: true, isLive: true },
    });

    if (!role)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.ROLE.BASE, id),
      );

    // if (dto.isLive === false && role.isLive === true) {
    //   if (role.users && role.users.length > 0) {
    //     throw new BadRequestException(
    //       MESSAGES.ERROR.ACTION_DENIED_IN_USE(
    //         ACTIONS.DRAFT,
    //         RESOURCES.ROLE.BASE,
    //         role.users.length,
    //         RESOURCES.USER.PLURAL,
    //       ),
    //     );
    //   }
    // }

    // Extract permissionIds so they don't break Object.assign
    // 4. Tránh load toàn bộ users vào RAM để check .length
    if (dto.isLive === false && role.isLive === true) {
      const userCount = await this.userRepository.countBy({ role: { id } });
      if (userCount > 0) {
        throw new BadRequestException(
          MESSAGES.ERROR.ACTION_DENIED_IN_USE(
            ACTIONS.DRAFT,
            RESOURCES.ROLE.BASE,
            userCount,
            RESOURCES.USER.PLURAL,
          ),
        );
      }
    }
    const { permissionIds, ...textData } = dto;
    Object.assign(role, textData);

    if (permissionIds) {
      role.permissions = await this.permissionRepository.find({
        where: { id: In(permissionIds), isLive: true }, // Only assign perms
      });
    }

    role.updatedBy = user.id;
    role.updatedByName = user.fullName;

    return this.roleRepository.save(role);
  }

  @CacheClear({
    key: (id: unknown) => [
      `role:${id as string}`,
      `role:details:${id as string}`,
      'roles:available',
      'roles:list:*',
      'roles:recycle-bin',
      'user:*:perms',
    ],
    isPattern: true,
  })
  async remove(id: string, user: ActiveUserData): Promise<void> {
    // const role = await this.roleRepository.findOne({
    //   where: { id },
    //   relations: { users: true },
    // });
    const role = await this.roleRepository.findOne({
      where: { id },
      select: { id: true, isDefault: true },
    });
    if (!role)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.ROLE.BASE),
      );
    if (role.isDefault)
      throw new BadRequestException(
        MESSAGES.ERROR.DEFAULT(RESOURCES.ROLE.SYSTEM),
      );

    // if (role.users && role.users.length > 0)
    //   throw new BadRequestException(MESSAGES.ERROR.IN_USE(RESOURCES.ROLE.BASE));

    // role.deletedBy = user.id;
    // role.deletedByName = user.fullName;

    // await this.roleRepository.remove(role);
    // Đếm số lượng user liên kết qua COUNT query
    const userCount = await this.userRepository.countBy({ role: { id } });
    if (userCount > 0) {
      throw new BadRequestException(MESSAGES.ERROR.IN_USE(RESOURCES.ROLE.BASE));
    }

    await this.roleRepository.update(id, {
      deletedBy: user.id,
      deletedByName: user.fullName,
    });

    // 5. Sử dụng softDelete thay vì remove để hỗ trợ Recycle Bin
    await this.roleRepository.softDelete(id);
  }

  // --- SPECIALIZED METHODS ---
  @Cacheable({
    key: 'roles:available',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800,
  })
  async findAvailable(_bypassCache?: boolean): Promise<Partial<Role>[]> {
    return this.roleRepository.find({
      select: { id: true, name: true, slug: true },
      where: { isLive: true },
      order: { name: 'ASC' },
    });
  }

  // --- SPECIALIZED UI METRICS & ASSIGNMENTS ---
  // Pre-groups permissions by module/feature for the frontend checkboxes
  @Cacheable({
    key: 'roles:permissions:grouped',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800,
  })
  async findAllPermissionsGrouped(
    _bypassCache?: boolean,
  ): Promise<Record<string, Permission[]>> {
    // const permissions = await this.permissionRepository.find({
    //   where: { isLive: true },
    //   relations: { resource: true },
    // });
    const permissions = await this.permissionRepository.find({
      select: {
        id: true,
        name: true,
        slug: true,
        action: true,
        scope: true,
        resource: {
          id: true,
          name: true,
        },
      },
      where: { isLive: true },
      relations: { resource: true },
    });

    return permissions.reduce((acc: Record<string, Permission[]>, perm) => {
      const groupName = perm.resource?.name || 'Chung';
      (acc[groupName] = acc[groupName] || []).push(perm);
      return acc;
    }, {});
  }

  // UI Flow A: Update Role Permissions
  @CacheClear({
    key: (roleId: unknown) => [
      `role:${roleId as string}`,
      `role:details:${roleId as string}`,
      'roles:list:*',
      'user:*:perms',
    ],
    isPattern: true,
  })
  async updateRolePermissions(
    roleId: string,
    permissionIds: string[],
    user: ActiveUserData,
  ): Promise<Role> {
    // const role = await this.roleRepository.findOneBy({ id: roleId });
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.ROLE.BASE),
      );

    role.permissions = await this.permissionRepository.findBy({
      id: In(permissionIds),
    });
    role.updatedBy = user.id;
    role.updatedByName = user.fullName;

    return this.roleRepository.save(role);
  }

  // UI Flow B: Bulk assign users to a role
  @CacheClear({
    key: (roleId: unknown) => [
      `role:${roleId as string}`,
      `role:details:${roleId as string}`,
      'roles:list:*',
    ],
    isPattern: true,
  })
  async assignUsersToRole(roleId: string, userIds: string[]) {
    if (!userIds.length) return { success: true, updatedCount: 0 };

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      select: { id: true, isLive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (!role.isLive)
      throw new BadRequestException(
        MESSAGES.ERROR.ASSIGNMENT_DENIED_STATE(
          RESOURCES.USER.BASE,
          ACTIONS.DRAFT,
          RESOURCES.ROLE.BASE,
        ),
      );

    // // Pre-fetch users to capture their CURRENT roles before we overwrite them
    // const existingUsers = await this.userRepository.find({
    //   where: { id: In(userIds) },
    //   relations: { role: true },
    // });
    // Chỉ lấy role id hiện tại của user để invalidation
    const existingUsers = await this.userRepository.find({
      select: { id: true, role: { id: true } },
      where: { id: In(userIds) },
      relations: { role: true },
    });

    // Extract all unique old role IDs
    const oldRoleIds = [
      ...new Set(
        existingUsers
          .map((u) => u.role?.id)
          .filter((id) => id !== undefined && id !== roleId),
      ),
    ];

    // Perform bulk update
    // await this.userRepository.update({ id: In(userIds) }, { role: role });
    await this.userRepository.update(
      { id: In(userIds) },
      { role: { id: roleId } },
    );

    // // Cache invalidation: Manually wipe every old role cache so their `userCount` drops instantly!
    // for (const oldId of oldRoleIds) {
    //   await this.cacheService.del(`role:${oldId}`);
    // }
    // 6. Xóa cache đồng thời bằng Promise.all thay vì await tuần tự
    const cachePromises = [
      ...oldRoleIds.map((oldId) => this.cacheService.del(`role:${oldId}`)),
      ...oldRoleIds.map((oldId) =>
        this.cacheService.del(`role:details:${oldId}`),
      ),
      ...userIds.map((userId) => this.cacheService.del(`user:${userId}:perms`)),
    ];
    await Promise.all(cachePromises);

    // Cache invalidation required for all updated users
    // userIds.forEach(id => this.redisClient.del(`user:${id}:bonus`));

    return { success: true, updatedCount: userIds.length };
  }

  // UI Flow: Add a single user to a role
  @CacheClear({
    key: (roleId: unknown, userId: unknown) => [
      `role:${roleId as string}`,
      `role:details:${roleId as string}`,
      'roles:list:*',
      `user:${userId as string}:perms`,
    ],
    isPattern: true,
  })
  async assignSingleUser(
    roleId: string,
    userId: string,
    admin: ActiveUserData,
  ) {
    // const role = await this.roleRepository.findOneBy({ id: roleId });
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      select: { id: true, name: true, isLive: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (!role.isLive) {
      throw new BadRequestException('Cannot assign users to a Draft role.');
    }

    // const user = await this.userRepository.findOne({
    //   where: { id: userId },
    //   relations: { role: true },
    // });
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, role: { id: true } },
      relations: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const oldRoleId = user.role?.id;

    // // Assign the new role
    // user.role = role;
    // user.updatedBy = admin.id;
    // user.updatedByName = admin.fullName;
    // await this.userRepository.save(user);

    // // Cache Magic: Manually wipe the old role so its user count drops!
    // if (oldRoleId && oldRoleId !== roleId) {
    //   await this.cacheService.del(`role:${oldRoleId}`);
    // }

    await this.userRepository.update(userId, {
      role: { id: roleId },
      updatedBy: admin.id,
      updatedByName: admin.fullName,
    });

    if (oldRoleId && oldRoleId !== roleId) {
      await Promise.all([
        this.cacheService.del(`role:${oldRoleId}`),
        this.cacheService.del(`role:details:${oldRoleId}`),
      ]);
    }

    return { success: true, message: `User added to ${role.name}` };
  }

  // UI Flow: Remove a single user from a role
  @CacheClear({
    key: (roleId: unknown, userId: unknown) => [
      `role:${roleId as string}`,
      'roles:list:*',
      `user:${userId as string}:perms`,
    ],
    isPattern: true,
  })
  async unassignSingleUser(
    roleId: string,
    userId: string,
    admin: ActiveUserData,
  ) {
    // const role = await this.roleRepository.findOneBy({ id: roleId });
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Role not found');

    // const user = await this.userRepository.findOne({
    //   where: { id: userId },
    //   relations: { role: true },
    // });
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, role: { id: true } },
      relations: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role?.id !== roleId) {
      throw new BadRequestException(
        'User is not currently assigned to this role.',
      );
    }

    // Enterprise RBAC Rule: Users cannot have NO role.
    // When removed, they must fall back to the baseline GUEST role.
    // const guestRole = await this.roleRepository.findOneBy({ slug: 'GUEST' });
    const guestRole = await this.roleRepository.findOne({
      where: { slug: 'GUEST' },
      select: { id: true },
    });
    if (!guestRole)
      throw new InternalServerErrorException('System GUEST role missing');

    // user.role = guestRole;
    // user.updatedBy = admin.id;
    // user.updatedByName = admin.fullName;
    // await this.userRepository.save(user);

    // // Cache Magic: Manually wipe the Guest role cache so its count goes up
    // await this.cacheService.del(`role:${guestRole.id}`);
    await this.userRepository.update(userId, {
      role: { id: guestRole.id },
      updatedBy: admin.id,
      updatedByName: admin.fullName,
    });

    await Promise.all([
      this.cacheService.del(`role:${guestRole.id}`),
      this.cacheService.del(`role:details:${guestRole.id}`),
    ]);
    return { success: true, message: `User removed and downgraded to GUEST` };
  }

  // UI Flow: Quick Toggle in Data Grid
  @CacheClear({
    key: (id: unknown) => [
      `role:${id as string}`,
      `role:details:${id as string}`,
      'roles:available',
      'roles:list:*',
      'user:*:perms',
    ],
    isPattern: true,
  })
  async toggleStatus(
    id: string,
    dto: ToggleStatusDto,
    user: ActiveUserData,
  ): Promise<Role> {
    // const role = await this.roleRepository.findOne({
    //   where: { id },
    //   relations: { users: true },
    // });
    const role = await this.roleRepository.findOne({
      where: { id },
      select: { id: true, isLive: true },
    });

    if (!role) throw new NotFoundException('Role not found');
    if (role.isLive === dto.isLive) return role;

    // // SAFETY CHECK: Transitioning from Live (true) to Draft (false)
    // if (dto.isLive === false && role.users && role.users.length > 0) {
    //   throw new BadRequestException(
    //     MESSAGES.ERROR.ACTION_DENIED_IN_USE(
    //       ACTIONS.DRAFT,
    //       RESOURCES.ROLE.BASE,
    //       role.users.length,
    //       RESOURCES.USER.PLURAL,
    //     ),
    //   );
    // }

    if (dto.isLive === false) {
      const userCount = await this.userRepository.countBy({ role: { id } });
      if (userCount > 0) {
        throw new BadRequestException(
          MESSAGES.ERROR.ACTION_DENIED_IN_USE(
            ACTIONS.DRAFT,
            RESOURCES.ROLE.BASE,
            userCount,
            RESOURCES.USER.PLURAL,
          ),
        );
      }
    }

    // role.isLive = dto.isLive;
    // role.updatedBy = user.id;
    // role.updatedByName = user.fullName;

    // return this.roleRepository.save(role);

    await this.roleRepository.update(id, {
      isLive: dto.isLive,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    role.isLive = dto.isLive;
    return role;
  }

  // --- RECYCLE BIN ---
  @Cacheable({
    key: 'roles:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 3600,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<Role[]> {
    // return this.roleRepository.find({
    //   where: { deletedAt: Not(IsNull()) },
    //   withDeleted: true,
    //   order: { deletedAt: 'DESC' },
    // });
    return this.roleRepository.find({
      select: {
        id: true,
        slug: true,
        name: true,
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
      `role:${id as string}`,
      `role:details:${id as string}`,
      'roles:available',
      'roles:list:*',
      'roles:recycle-bin',
      'user:*:perms',
    ],
    isPattern: true,
  })
  async restore(id: string, user: ActiveUserData): Promise<Role> {
    // const role = await this.roleRepository.findOne({
    //   where: { id },
    //   withDeleted: true,
    // });
    const role = await this.roleRepository.findOne({
      where: { id },
      withDeleted: true,
      select: { id: true, deletedAt: true },
    });

    if (!role)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.ROLE.BASE, id),
      );
    if (!role.deletedAt)
      throw new BadRequestException('This role is not in the recycle bin.');

    // role.deletedAt = null;
    // role.deletedBy = null;
    // role.deletedByName = null;

    // role.updatedBy = user.id;
    // role.updatedByName = user.fullName;

    // return this.roleRepository.save(role);
    await this.roleRepository.restore(id);
    await this.roleRepository.update(id, {
      deletedBy: null,
      deletedByName: null,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    role.deletedAt = null;
    return role;
  }
}
