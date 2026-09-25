// src/resources/system-resources.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository, Not, IsNull, In } from 'typeorm';
import {
  buildFindOptions,
  buildPaginationMeta,
} from 'src/common/utils/typeorm-query.util';
import { SystemResource } from './entities/system-resource.entity';
import { CreateSystemResourceDto } from './dto/create-system-resource.dto';
import { UpdateSystemResourceDto } from './dto/update-system-resource.dto';
import { ResourceQueryDto } from './dto/system-resource-query.dto';
import { ToggleStatusDto } from 'src/common/dto/toggle-status.dto';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { CacheService } from 'src/common/cache/cache.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { MESSAGES } from 'src/common/constants/messages.constant';
import { RESOURCES } from 'src/common/constants/resources.constant';
import { FIELDS } from 'src/common/constants/field.constant';
import { ACTIONS } from 'src/common/constants/action.constant';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { Permission } from 'src/permissions/entities/permission.entity';

@Injectable()
export class SystemResourcesService {
  constructor(
    @InjectRepository(SystemResource)
    private readonly resourceRepository: Repository<SystemResource>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    readonly cacheService: CacheService,
  ) {}

  // --- STANDARD CRUD ---
  @CacheClear({
    key: [
      'resources:available',
      'resources:list:*',
      'permissions:matrix',
      'permissions:available',
      'permissions:list:*',
    ],
    isPattern: true,
  })
  async create(
    dto: CreateSystemResourceDto,
    user: ActiveUserData,
  ): Promise<SystemResource> {
    // 1. Chỉ kiểm tra sự tồn tại (Projection ID duy nhất để giảm payload I/O)
    const exists = await this.resourceRepository.exists({
      where: { slug: dto.slug },
    });
    if (exists) {
      throw new ConflictException(
        MESSAGES.ERROR.ALREADY_EXISTS(
          RESOURCES.RESOURCE.BASE,
          FIELDS.SLUG,
          dto.slug,
        ),
      );
    }

    const { permissions, ...resourceData } = dto;

    const resource = this.resourceRepository.create({
      ...resourceData,
      createdBy: user.id,
      createdByName: user.fullName,
      updatedBy: user.id,
      updatedByName: user.fullName,
      isLive: dto.isLive ?? false,
    });

    const savedResource = await this.resourceRepository.save(resource);

    // 2. Batching insert permissions
    if (permissions?.length) {
      const permissionsToCreate = permissions.map((p) =>
        this.permissionRepository.create({
          slug: `${savedResource.slug}:${p.action}:${p.scope}`,
          name: p.name || `${p.action} ${savedResource.slug} (${p.scope})`,
          description: p.description,
          action: p.action,
          scope: p.scope,
          resource: savedResource,
          isDefault: false,
          isLive: true,
          createdBy: user.id,
          createdByName: user.fullName,
          updatedBy: user.id,
          updatedByName: user.fullName,
        }),
      );

      savedResource.permissions =
        await this.permissionRepository.save(permissionsToCreate);
    }

    // Explicit manual cache clear to prevent frontend race conditions
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('permissions:list:*');
    //   await this.cacheService.del('permissions:matrix');
    // }

    return savedResource;
  }

  @Cacheable({
    key: (query: unknown) => `resources:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: ResourceQueryDto,
    _bypassCache?: boolean,
  ): Promise<{ data: SystemResource[]; meta: PaginationMetaDto }> {
    const customFilters: FindOptionsWhere<SystemResource> = {};
    if (query.isLive !== undefined) {
      customFilters.isLive = query.isLive;
    }

    const findOptions = buildFindOptions<SystemResource>({
      queryDto: query,
      searchableColumns: ['slug', 'name', 'description'],
      sortableColumns: ['slug', 'name', 'isLive'],
      defaultSort: 'slug',
      customFilters,
    });

    // findOptions.relations = { permissions: true };

    // const repo: Repository<SystemResource> = this.resourceRepository;
    // const [items, total] = await repo.findAndCount(findOptions);

    // 3. Payload Optimization: Chỉ lấy các trường cần thiết hiển thị bảng
    findOptions.select = {
      id: true,
      slug: true,
      name: true,
      description: true,
      isLive: true,
      createdAt: true,
      updatedAt: true,
    };

    const [items, total] =
      await this.resourceRepository.findAndCount(findOptions);

    return {
      data: items,
      meta: buildPaginationMeta(query, total),
    };
  }

  @Cacheable({ key: 'permissions:matrix', ttlSeconds: 86400 })
  async getPermissionMatrix() {
    // const resources = await this.resourceRepository.find({
    //   relations: { permissions: true },
    //   order: { name: 'ASC' },
    // });

    // return resources.map((resource) => ({
    //   id: resource.id,
    //   name: resource.name,
    //   slug: resource.slug,
    //   description: resource.description,
    //   permissions: resource.permissions
    //     .map((perm) => ({
    //       id: perm.id,
    //       name: perm.name,
    //       slug: perm.slug,
    //       action: perm.action,
    //       scope: perm.scope,
    //     }))
    //     .sort((a, b) => a.action.localeCompare(b.action)),
    // }));
    // 4. Join có chọn lọc (Selective Fields Projection) thay vì nạp toàn bộ entity
    return this.resourceRepository
      .createQueryBuilder('resource')
      .leftJoin('resource.permissions', 'permission')
      .select([
        'resource.id',
        'resource.name',
        'resource.slug',
        'resource.description',
        'permission.id',
        'permission.name',
        'permission.slug',
        'permission.action',
        'permission.scope',
      ])
      .orderBy('resource.name', 'ASC')
      .addOrderBy('permission.action', 'ASC')
      .getMany();
  }

  @Cacheable({
    key: (id: unknown) => `resource:${id as string}`,
    forceRefresh: (_id: unknown, bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 86400,
  })
  async findOne(id: string, _bypassCache?: boolean): Promise<SystemResource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: { permissions: true },
    });
    if (!resource) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE, id),
      );
    }
    return resource;
  }

  @CacheClear({
    key: (id: unknown) => [
      `resource:${id as string}`,
      'resources:available',
      'resources:list:*',
      'permissions:matrix',
      'permissions:available',
      'permissions:list:*',
    ],
    isPattern: true,
  })
  async update(
    id: string,
    dto: UpdateSystemResourceDto,
    user: ActiveUserData,
  ): Promise<SystemResource> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!resource)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE),
      );

    if (dto.slug && dto.slug !== resource.slug) {
      // const exists = await this.resourceRepository.findOneBy({
      //   slug: dto.slug,
      // });
      // 1. Chỉ kiểm tra sự tồn tại (Projection ID duy nhất để giảm payload I/O)
      const exists = await this.resourceRepository.exists({
        where: { slug: dto.slug },
      });
      if (exists) {
        throw new ConflictException(
          MESSAGES.ERROR.ALREADY_EXISTS(
            RESOURCES.RESOURCE.BASE,
            FIELDS.SLUG,
            dto.slug,
          ),
        );
      }
    }

    const { permissionIds, ...resourceData } = dto;

    if (dto.isLive === false && resource.isLive === true) {
      if (resource.permissions && resource.permissions.length > 0) {
        throw new BadRequestException(
          MESSAGES.ERROR.ACTION_DENIED_IN_USE(
            ACTIONS.DRAFT,
            RESOURCES.RESOURCE.BASE,
            resource.permissions.length,
            RESOURCES.PERMISSION.PLURAL,
          ),
        );
      }
    }

    Object.assign(resource, resourceData);
    resource.updatedBy = user.id;
    resource.updatedByName = user.fullName;

    // const savedResource = await this.resourceRepository.save(resource);

    // ==========================================
    // SYNC PERMISSIONS BY ID
    // ==========================================
    if (permissionIds) {
      const existingIds = (resource.permissions || []).map((p) => p.id);

      // A. REMOVE: IDs that exist in DB but are missing from the frontend payload
      // const idsToRemove = existingIds.filter(
      //   (dbId) => !permissionIds.includes(dbId),
      // );

      // if (idsToRemove.length > 0) {
      //   const fullRemovePerms = await this.permissionRepository.find({
      //     where: { id: In(idsToRemove) },
      //     relations: { roles: true, users: true },
      //   });

      //   for (const p of fullRemovePerms) {
      //     const inUseByRoles = p.roles?.length || 0;
      //     const inUseByUsers = p.users?.length || 0;

      //     if (inUseByRoles > 0 || inUseByUsers > 0) {
      //       throw new BadRequestException(
      //         `Không thể xóa quyền '${p.slug}'. Quyền này đang được gán cho ${inUseByRoles} vai trò và ${inUseByUsers} người dùng.`,
      //       );
      //     }
      //   }
      //   await this.permissionRepository.softRemove(fullRemovePerms);
      // }
      const idsToRemove = existingIds.filter(
        (dbId) => !permissionIds.includes(dbId),
      );
      if (idsToRemove.length > 0) {
        // 5. Triệt tiêu N+1 Query: Kiểm tra ràng buộc qua SQL Count thay vì kéo User/Role entity
        const inUseCounts = await this.permissionRepository
          .createQueryBuilder('p')
          .leftJoin('p.roles', 'r')
          .leftJoin('p.users', 'u')
          .select('p.slug', 'slug')
          .addSelect('COUNT(DISTINCT r.id)', 'rolesCount')
          .addSelect('COUNT(DISTINCT u.id)', 'usersCount')
          .where('p.id IN (:...ids)', { ids: idsToRemove })
          .groupBy('p.id')
          .having('COUNT(DISTINCT r.id) > 0 OR COUNT(DISTINCT u.id) > 0')
          .getRawMany<{
            slug: string;
            rolesCount: string;
            usersCount: string;
          }>();

        if (inUseCounts.length > 0) {
          const firstViolation = inUseCounts[0];
          throw new BadRequestException(
            `Không thể xóa quyền '${firstViolation.slug}'. Quyền này đang được gán cho ${firstViolation.rolesCount} vai trò và ${firstViolation.usersCount} người dùng.`,
          );
        }

        await this.permissionRepository.softDelete({ id: In(idsToRemove) });
      }

      // B. ADD: Link existing permissions to this resource if the frontend passed an ID that wasn't previously linked
      const idsToAdd = permissionIds.filter(
        (reqId) => !existingIds.includes(reqId),
      );

      // if (idsToAdd.length > 0) {
      //   const permsToAssign = await this.permissionRepository.findBy({
      //     id: In(idsToAdd),
      //   });

      //   // Link them to the current resource
      //   permsToAssign.forEach((p) => {
      //     p.resource = savedResource;
      //     p.updatedBy = user.id;
      //     p.updatedByName = user.fullName;
      //   });
      //   await this.permissionRepository.save(permsToAssign);
      // }
      if (idsToAdd.length > 0) {
        await this.permissionRepository.update(
          { id: In(idsToAdd) },
          {
            resource: { id: resource.id },
            updatedBy: user.id,
            updatedByName: user.fullName,
          },
        );
      }
    }

    // const finalResource = await this.resourceRepository.findOne({
    //   where: { id: savedResource.id },
    //   relations: { permissions: true },
    // });

    // Explicit manual cache clear to prevent frontend race conditions
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern(`resource:${id}`);
    //   await this.cacheService.delPattern('permissions:list:*');
    //   await this.cacheService.del('permissions:matrix');
    // }

    await this.resourceRepository.save(resource);

    // Trả về bản ghi đã nạp mới mà không cần câu findOne thừa nếu không đổi relation

    return resource;
  }

  @CacheClear({
    key: (id: unknown) => [
      `resource:${id as string}`,
      'resources:available',
      'resources:list:*',
      'permissions:matrix',
    ],
    isPattern: true,
  })
  async remove(id: string, user: ActiveUserData): Promise<void> {
    // const resource = await this.resourceRepository.findOne({
    //   where: { id },
    //   relations: {
    //     permissions: true,
    //   },
    // });
    const resource = await this.resourceRepository.findOne({
      where: { id },
      select: { id: true, name: true },
    });

    if (!resource)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE, id),
      );

    // if (resource.permissions && resource.permissions.length > 0) {
    //   throw new BadRequestException(
    //     MESSAGES.ERROR.HAS_DEPENDENCIES(
    //       RESOURCES.RESOURCE.BASE,
    //       resource.name,
    //       resource.permissions.length,
    //       RESOURCES.PERMISSION.PLURAL,
    //     ),
    //   );
    // }

    // resource.deletedBy = user.id;
    // resource.deletedByName = user.fullName;
    // await this.resourceRepository.save(resource);

    // await this.resourceRepository.softRemove(resource);

    // // Explicit manual cache clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.del('permissions:matrix');
    // }

    // 6. Tối ưu I/O: Dùng countBy kiểm tra ràng buộc, tránh load danh sách entity Permissions
    const permissionCount = await this.permissionRepository.countBy({
      resource: { id },
    });

    if (permissionCount > 0) {
      throw new BadRequestException(
        MESSAGES.ERROR.HAS_DEPENDENCIES(
          RESOURCES.RESOURCE.BASE,
          resource.name,
          permissionCount,
          RESOURCES.PERMISSION.PLURAL,
        ),
      );
    }

    await this.resourceRepository.update(id, {
      deletedBy: user.id,
      deletedByName: user.fullName,
    });

    await this.resourceRepository.softDelete(id);
  }

  @Cacheable({
    key: 'resources:available',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800, // 7 ngày - dữ liệu tĩnh ít thay đổi
  })
  async findAvailable(
    _bypassCache?: boolean,
  ): Promise<Partial<SystemResource>[]> {
    // Tối ưu Index: Query này match đúng index (isLive, deletedAt)
    return this.resourceRepository.find({
      select: { id: true, name: true, slug: true },
      where: { isLive: true },
      order: { name: 'ASC' },
    });
  }

  @CacheClear({
    key: (id: unknown) => [
      `resource:${id as string}`,
      'resources:available',
      'resources:list:*',
      'permissions:matrix',
      'permissions:available',
      'permissions:list:*',
    ],
    isPattern: true,
  })
  async toggleStatus(
    id: string,
    dto: ToggleStatusDto,
    user: ActiveUserData,
  ): Promise<SystemResource> {
    // const resource = await this.resourceRepository.findOne({
    //   where: { id },
    //   relations: { permissions: true },
    // });
    const resource = await this.resourceRepository.findOne({
      where: { id },
      select: { id: true, isLive: true },
    });

    if (!resource)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE),
      );
    if (resource.isLive === dto.isLive) {
      throw new BadRequestException(
        `Resource is already in ${dto.isLive ? 'Live' : 'Draft'} status.`,
      );
    }
    // if (dto.isLive === false) {
    //   if (resource.permissions && resource.permissions.length > 0) {
    //     throw new BadRequestException(
    //       MESSAGES.ERROR.ACTION_DENIED_IN_USE(
    //         ACTIONS.DRAFT,
    //         RESOURCES.RESOURCE.BASE,
    //         resource.permissions.length,
    //         RESOURCES.PERMISSION.PLURAL,
    //       ),
    //     );
    //   }
    // }

    // resource.isLive = dto.isLive;
    // resource.updatedBy = user.id;
    // resource.updatedByName = user.fullName;
    // const saved = await this.resourceRepository.save(resource);

    // // Explicit manual cache clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('permissions:list:*');
    //   await this.cacheService.del('permissions:matrix');
    // }

    // return saved;
    if (dto.isLive === false) {
      const activePermCount = await this.permissionRepository.countBy({
        resource: { id },
      });
      if (activePermCount > 0) {
        throw new BadRequestException(
          MESSAGES.ERROR.ACTION_DENIED_IN_USE(
            ACTIONS.DRAFT,
            RESOURCES.RESOURCE.BASE,
            activePermCount,
            RESOURCES.PERMISSION.PLURAL,
          ),
        );
      }
    }

    await this.resourceRepository.update(id, {
      isLive: dto.isLive,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    resource.isLive = dto.isLive;
    return resource;
  }

  @Cacheable({
    key: 'resources:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 3600,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<SystemResource[]> {
    // return this.resourceRepository.find({
    //   where: {
    //     deletedAt: Not(IsNull()),
    //   },
    //   withDeleted: true,
    //   order: { deletedAt: 'DESC' },
    // });

    return this.resourceRepository.find({
      select: {
        id: true,
        name: true,
        slug: true,
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
      `resource:${id as string}`,
      'resources:available',
      'resources:list:*',
      'resources:recycle-bin',
      'permissions:matrix',
      'permissions:available',
      'permissions:list:*',
    ],
    isPattern: true,
  })
  async restore(id: string, user: ActiveUserData): Promise<SystemResource> {
    // const resource = await this.resourceRepository.findOne({
    //   where: { id },
    //   withDeleted: true,
    // });
    const resource = await this.resourceRepository.findOne({
      where: { id },
      withDeleted: true,
      select: { id: true, deletedAt: true },
    });

    if (!resource) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE, id),
      );
    }

    if (!resource.deletedAt) {
      throw new BadRequestException('This resource is not in the recycle bin.');
    }

    // resource.deletedAt = null;
    // resource.deletedBy = null;
    // resource.deletedByName = null;
    // resource.updatedBy = user.id;
    // resource.updatedByName = user.fullName;

    // const saved = await this.resourceRepository.save(resource);

    // // Explicit manual cache clear
    // if (this.cacheService.delPattern) {
    //   await this.cacheService.delPattern('resources:list:*');
    //   await this.cacheService.delPattern('permissions:list:*');
    //   await this.cacheService.del('permissions:matrix');
    // }

    // return saved;

    await this.resourceRepository.restore(id);
    await this.resourceRepository.update(id, {
      deletedBy: null,
      deletedByName: null,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    resource.deletedAt = null;
    return resource;
  }
}
