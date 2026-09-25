// src/permissions/permissions.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Not, IsNull } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { PermissionAction } from './enums/permission-action.enum';
import { PermissionScope } from './enums/permission-scope.enum';
import { SystemResource } from 'src/resources/entities/system-resource.entity';
import { ToggleStatusDto } from 'src/common/dto/toggle-status.dto';
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

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(SystemResource)
    private readonly resourceRepository: Repository<SystemResource>,
    readonly cacheService: CacheService,
  ) {}

  /**
   * Helper nội bộ: Kiểm tra quyền có đang bị Role hoặc User sử dụng không bằng SQL Aggregate COUNT
   * Triệt tiêu hoàn toàn việc kéo danh sách entity User/Role vào bộ nhớ Node.js
   */
  private async getUsageCounts(
    permissionId: string,
  ): Promise<{ rolesCount: number; usersCount: number }> {
    const result = await this.permissionRepository
      .createQueryBuilder('p')
      .leftJoin('p.roles', 'r')
      .leftJoin('p.users', 'u')
      .select('COUNT(DISTINCT r.id)', 'rolesCount')
      .addSelect('COUNT(DISTINCT u.id)', 'usersCount')
      .where('p.id = :id', { id: permissionId })
      .getRawOne<{ rolesCount: string; usersCount: string }>();

    return {
      rolesCount: parseInt(result?.rolesCount || '0', 10),
      usersCount: parseInt(result?.usersCount || '0', 10),
    };
  }

  // --- STANDARD CRUD ---
  @CacheClear({
    key: [
      'permissions:available',
      'permissions:list:*',
      'permissions:matrix',
      'resources:list:*',
      'resource:*',
    ],
    isPattern: true,
  })
  async create(
    dto: CreatePermissionDto,
    user: ActiveUserData,
  ): Promise<Permission> {
    // 1. Chỉ select các cột cần kiểm tra điều kiện
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId },
      select: { id: true, slug: true, isLive: true },
    });
    if (!resource)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.PERMISSION.BASE),
      );
    if (!resource.isLive)
      throw new BadRequestException(MESSAGES.ERROR.PERMISSIONS.CANNOT_ASSIGN);

    const generatedSlug = `${resource.slug}:${dto.action}:${dto.scope}`;

    // const existing = await this.permissionRepository.findOneBy({
    //   slug: generatedSlug,
    // });
    // 2. Dùng exists thay vì findOneBy để CSDL dừng quét ngay khi thấy bản ghi
    const exists = await this.permissionRepository.exists({
      where: { slug: generatedSlug },
    });
    if (exists)
      throw new ConflictException(
        MESSAGES.ERROR.ALREADY_EXISTS(RESOURCES.PERMISSION.BASE),
      );

    // const permission = this.permissionRepository.create({
    //   ...dto,
    //   slug: generatedSlug,
    //   name: dto.name,
    //   action: dto.action,
    //   scope: dto.scope,
    //   resource: resource,
    //   isDefault: false,
    //   createdBy: user.id,
    //   createdByName: user.fullName,
    //   updatedBy: user.id,
    //   updatedByName: user.fullName,
    //   isLive: false, // Starts as draft
    // });

    // const savedPerm = await this.permissionRepository.save(permission);

    // // Explicit manual cross-module clear to guarantee synchronization
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    // }

    // return savedPerm;
    const permission = this.permissionRepository.create({
      ...dto,
      slug: generatedSlug,
      name: dto.name,
      action: dto.action,
      scope: dto.scope,
      resource: { id: resource.id } as SystemResource,
      isDefault: false,
      createdBy: user.id,
      createdByName: user.fullName,
      updatedBy: user.id,
      updatedByName: user.fullName,
      isLive: false,
    });

    return this.permissionRepository.save(permission);
  }

  @Cacheable({
    key: (query: unknown) => `permissions:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: PermissionQueryDto,
    _bypassCache?: boolean,
  ): Promise<{ data: Permission[]; meta: PaginationMetaDto }> {
    const customFilters: FindOptionsWhere<Permission> = {};
    if (query.isLive !== undefined) {
      customFilters.isLive = query.isLive;
    }
    if (query.resourceId) {
      // TypeORM syntax for filtering by relation ID
      customFilters.resource = { id: query.resourceId };
    }

    const findOptions = buildFindOptions<Permission>({
      queryDto: query,
      searchableColumns: ['slug', 'name', 'description'],
      sortableColumns: ['slug', 'name', 'isLive', 'isDefault'],
      defaultSort: 'slug',
      customFilters,
    });

    // // Merge relation loading so the UI table gets the resource details
    // findOptions.relations = { resource: true };

    // const repo: Repository<Permission> = this.permissionRepository;
    // const [items, total] = await repo.findAndCount(findOptions);

    // return {
    //   data: items,
    //   meta: buildPaginationMeta(query, total),
    // };
    // 3. Selective Projection: Chỉ lấy các trường phục vụ hiển thị bảng

    findOptions.select = {
      id: true,
      slug: true,
      name: true,
      action: true,
      scope: true,
      isLive: true,
      isDefault: true,
      createdAt: true,
      resource: {
        id: true,
        name: true,
        slug: true,
      },
    };

    findOptions.relations = { resource: true };

    const [items, total] =
      await this.permissionRepository.findAndCount(findOptions);

    return {
      data: items,
      meta: buildPaginationMeta(query, total),
    };
  }

  // Tell ESLint to ignore the missing await, because @Cacheable requires an async signature
  @Cacheable({
    key: 'permissions:enums',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400, // Dữ liệu tĩnh enum, lưu cache 24h
  })
  // eslint-disable-next-line @typescript-eslint/require-await
  async getPermissionEnums(_bypassCache?: boolean) {
    return {
      actions: Object.values(PermissionAction),
      scopes: Object.values(PermissionScope),
    };
  }

  @Cacheable({
    key: (id: unknown) => `permission:${id as string}`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400, // Dữ liệu tĩnh, lưu cache 24h
  })
  async findOne(id: string, _bypassCache?: boolean): Promise<Permission> {
    // const permission = await this.permissionRepository.findOne({
    //   where: { id },
    //   relations: { resource: true }, // Added: Ensure the UI gets the resource details
    // });
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: { resource: true },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        action: true,
        scope: true,
        isDefault: true,
        isLive: true,
        createdAt: true,
        resource: {
          id: true,
          name: true,
          slug: true,
        },
      },
    });
    if (!permission) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.PERMISSION.BASE, id),
      );
    }
    return permission;
  }

  @CacheClear({
    key: (id: unknown) => [
      `permission:${id as string}`,
      'permissions:available',
      'permissions:list:*',
      'permissions:matrix',
      'resources:list:*',
      'resource:*',
    ],
    isPattern: true,
  })
  async update(
    id: string,
    dto: UpdatePermissionDto,
    user: ActiveUserData,
  ): Promise<Permission> {
    // const permission = await this.permissionRepository.findOne({
    //   where: { id },
    //   relations: { roles: true, users: true, resource: true }, // Added resource
    // });
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: { resource: true },
      select: { id: true, isLive: true, resource: { id: true } },
    });
    if (!permission)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.PERMISSION.BASE),
      );

    // Only update allowed fields
    if (dto.resourceId && dto.resourceId !== permission.resource.id) {
      // const resource = await this.resourceRepository.findOneBy({
      //   id: dto.resourceId,
      // });
      const resourceExists = await this.resourceRepository.exists({
        where: { id: dto.resourceId },
      });
      if (!resourceExists)
        throw new NotFoundException(
          MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE),
        );
      // permission.resource = resource;
      permission.resource = { id: dto.resourceId } as SystemResource;
    }

    // if (dto.isLive === false && permission.isLive === true) {
    //   const inUseByRoles = permission.roles?.length || 0;
    //   const inUseByUsers = permission.users?.length || 0;
    //   if (inUseByRoles > 0 || inUseByUsers > 0) {
    //     throw new BadRequestException(
    //       `Cannot draft. Assigned to ${inUseByRoles} role(s) and ${inUseByUsers} user(s).`,
    //     );
    //   }
    // }
    // 4. Kiểm tra ràng buộc chuyển sang Draft bằng aggregate query siêu nhẹ
    if (dto.isLive === false && permission.isLive === true) {
      const { rolesCount, usersCount } = await this.getUsageCounts(id);
      if (rolesCount > 0 || usersCount > 0) {
        throw new BadRequestException(
          `Cannot draft. Assigned to ${rolesCount} role(s) and ${usersCount} user(s).`,
        );
      }
    }

    Object.assign(permission, dto);
    permission.updatedBy = user.id;
    permission.updatedByName = user.fullName;

    // const savedPerm = await this.permissionRepository.save(permission);

    // // Explicit manual cross-module clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('resource:*');
    // }

    // return savedPerm;
    return this.permissionRepository.save(permission);
  }

  @CacheClear({
    key: (id: unknown) => [
      `permission:${id as string}`,
      'permissions:available',
      'permissions:list:*',
      'permissions:matrix',
      'permissions:recycle-bin',
      'resources:list:*', // Restoration brings it back into resources
      'resource:*',
    ],
    isPattern: true,
  })
  async remove(id: string, user: ActiveUserData): Promise<void> {
    // const permission = await this.permissionRepository.findOne({
    //   where: { id },
    //   relations: { roles: true, users: true },
    // });
    const permission = await this.permissionRepository.findOne({
      where: { id },
      select: { id: true, isDefault: true },
    });
    if (!permission)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.PERMISSION.BASE),
      );
    if (permission.isDefault)
      throw new BadRequestException(MESSAGES.ERROR.PERMISSIONS.CANNOT_DELETE);

    // if (
    //   (permission.roles && permission.roles.length > 0) ||
    //   (permission.users && permission.users.length > 0)
    // )
    //   throw new BadRequestException(
    //     MESSAGES.ERROR.IN_USE(RESOURCES.PERMISSION.BASE),
    //   );

    // // Stamp the deleter's info BEFORE deleting
    // permission.deletedBy = user.id;
    // permission.deletedByName = user.fullName;
    // await this.permissionRepository.save(permission);

    // await this.permissionRepository.softRemove(permission);

    // // Explicit manual cross-module clear to guarantee synchronization
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('resource:*');
    // }

    // 5. Kiểm tra quyền đang sử dụng qua COUNT, không load danh sách Role/User
    const { rolesCount, usersCount } = await this.getUsageCounts(id);
    if (rolesCount > 0 || usersCount > 0) {
      throw new BadRequestException(
        MESSAGES.ERROR.IN_USE(RESOURCES.PERMISSION.BASE),
      );
    }

    await this.permissionRepository.update(id, {
      deletedBy: user.id,
      deletedByName: user.fullName,
    });

    await this.permissionRepository.softDelete(id);
  }

  // --- SPECIALIZED METHODS ---
  // UI Flow: Lightweight array for "Select Permissions" UI grids/dropdowns
  @Cacheable({
    key: 'permissions:available',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800, // 7 Days
  })
  async findAvailable(_bypassCache?: boolean): Promise<Partial<Permission>[]> {
    return this.permissionRepository.find({
      select: {
        id: true,
        name: true,
        slug: true,
        action: true,
        scope: true,
        resource: {
          id: true,
          name: true, // Only fetch parent resource ID and Name for grouping
        },
      },
      relations: { resource: true },
      where: { isLive: true },
      order: { slug: 'ASC' },
    });
  }

  // UI Flow: Quick Toggle in Data Grid
  @CacheClear({
    key: (id: unknown) => [
      `permission:${id as string}`,
      'permissions:available',
      'permissions:list:*',
      'permissions:matrix',
      'resources:list:*',
      'resource:*',
    ],
    isPattern: true,
  })
  async toggleStatus(
    id: string,
    dto: ToggleStatusDto,
    user: ActiveUserData,
  ): Promise<Permission> {
    // const permission = await this.permissionRepository.findOne({
    //   where: { id },
    //   relations: { roles: true, users: true },
    // });
    const permission = await this.permissionRepository.findOne({
      where: { id },
      select: { id: true, isLive: true },
    });

    if (!permission) throw new NotFoundException('Permission not found');
    if (permission.isLive === dto.isLive) return permission;

    // SAFETY CHECK: Transitioning from Live (true) to Draft (false)
    // if (dto.isLive === false) {
    //   const inUseByRoles = permission.roles?.length || 0;
    //   const inUseByUsers = permission.users?.length || 0;

    //   if (inUseByRoles > 0 || inUseByUsers > 0)
    //     throw new BadRequestException(
    //       `Cannot draft. Assigned to ${inUseByRoles} role(s) and ${inUseByUsers} user(s).`,
    //     );
    // }
    if (dto.isLive === false) {
      const { rolesCount, usersCount } = await this.getUsageCounts(id);
      if (rolesCount > 0 || usersCount > 0) {
        throw new BadRequestException(
          `Cannot draft. Assigned to ${rolesCount} role(s) and ${usersCount} user(s).`,
        );
      }
    }

    // permission.isLive = dto.isLive;

    // permission.updatedBy = user.id;
    // permission.updatedByName = user.fullName;

    // const savedPerm = await this.permissionRepository.save(permission);

    // // Explicit manual cross-module clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('resource:*');
    // }

    // return savedPerm;
    await this.permissionRepository.update(id, {
      isLive: dto.isLive,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    permission.isLive = dto.isLive;
    return permission;
  }

  // --- RECYCLE BIN ---

  @Cacheable({
    key: 'permissions:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 1800,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<Permission[]> {
    // return this.permissionRepository.find({
    //   where: {
    //     deletedAt: Not(IsNull()), // Only get records where deletedAt has a value
    //   },
    //   withDeleted: true, // Force TypeORM to bypass the soft-delete filter
    //   order: { deletedAt: 'DESC' }, // Show most recently deleted first
    // });
    return this.permissionRepository.find({
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        deletedByName: true,
      },
      where: {
        deletedAt: Not(IsNull()),
      },
      withDeleted: true,
      order: { deletedAt: 'DESC' },
    });
  }

  @CacheClear({
    key: (id: unknown) => [
      `permissions:${id as string}`,
      'permissions:available',
      'permissions:list:*',
      'permissions:matrix',
      'permissions:recycle-bin', // Clear the bin cache too
      'resources:list:*',
      'resource:*',
    ],
    isPattern: true,
  })
  async restore(id: string, user: ActiveUserData): Promise<Permission> {
    // const permission = await this.permissionRepository.findOne({
    //   where: { id },
    //   withDeleted: true, // Must include this to find the deleted record!
    // });
    const permission = await this.permissionRepository.findOne({
      where: { id },
      withDeleted: true,
      select: { id: true, deletedAt: true },
    });

    if (!permission) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.PERMISSION.BASE),
      );
    }

    if (!permission.deletedAt) {
      throw new BadRequestException('This resource is not in the recycle bin.');
    }

    // // 1. Clear the deletion audit trail so it looks brand new
    // permission.deletedAt = null;
    // permission.deletedBy = null;
    // permission.deletedByName = null;

    // // 2. Stamp the restoration event in the update audit trail
    // permission.updatedBy = user.id;
    // permission.updatedByName = user.fullName;

    // const savedPerm = await this.permissionRepository.save(permission);

    // // Explicit manual cross-module clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('resource:*');
    // }

    // return savedPerm;
    await this.permissionRepository.restore(id);
    await this.permissionRepository.update(id, {
      deletedBy: null,
      deletedByName: null,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    permission.deletedAt = null;
    return permission;
  }
}
