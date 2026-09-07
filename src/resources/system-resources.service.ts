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
    const existing = await this.resourceRepository.findOneBy({
      slug: dto.slug,
    });
    if (existing) {
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

    if (permissions && permissions.length > 0) {
      const permissionsToCreate = permissions.map((p) => {
        return this.permissionRepository.create({
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
        });
      });

      const savedPermissions =
        await this.permissionRepository.save(permissionsToCreate);

      savedResource.permissions = savedPermissions;
    }

    // 🛡️ Explicit manual cache clear to prevent frontend race conditions
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('resources:list:*');
      await this.cacheService.delPattern('permissions:list:*');
      await this.cacheService.del('permissions:matrix');
    }

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

    findOptions.relations = { permissions: true };

    const repo: Repository<SystemResource> = this.resourceRepository;
    const [items, total] = await repo.findAndCount(findOptions);

    return {
      data: items,
      meta: buildPaginationMeta(query, total),
    };
  }

  @Cacheable({ key: 'permissions:matrix', ttlSeconds: 86400 })
  async getPermissionMatrix() {
    const resources = await this.resourceRepository.find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });

    return resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      slug: resource.slug,
      description: resource.description,
      permissions: resource.permissions
        .map((perm) => ({
          id: perm.id,
          name: perm.name,
          slug: perm.slug,
          action: perm.action,
          scope: perm.scope,
        }))
        .sort((a, b) => a.action.localeCompare(b.action)),
    }));
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
      const existing = await this.resourceRepository.findOneBy({
        slug: dto.slug,
      });
      if (existing) {
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

    const savedResource = await this.resourceRepository.save(resource);

    // ==========================================
    // SYNC PERMISSIONS BY ID
    // ==========================================
    if (permissionIds) {
      const existingPerms = resource.permissions || [];
      const existingIds = existingPerms.map((p) => p.id);

      // A. REMOVE: IDs that exist in DB but are missing from the frontend payload
      const idsToRemove = existingIds.filter(
        (dbId) => !permissionIds.includes(dbId),
      );

      if (idsToRemove.length > 0) {
        const fullRemovePerms = await this.permissionRepository.find({
          where: { id: In(idsToRemove) },
          relations: { roles: true, users: true },
        });

        for (const p of fullRemovePerms) {
          const inUseByRoles = p.roles?.length || 0;
          const inUseByUsers = p.users?.length || 0;

          if (inUseByRoles > 0 || inUseByUsers > 0) {
            throw new BadRequestException(
              `Không thể xóa quyền '${p.slug}'. Quyền này đang được gán cho ${inUseByRoles} vai trò và ${inUseByUsers} người dùng.`,
            );
          }
        }
        await this.permissionRepository.softRemove(fullRemovePerms);
      }

      // B. ADD: Link existing permissions to this resource if the frontend passed an ID that wasn't previously linked
      const idsToAdd = permissionIds.filter(
        (reqId) => !existingIds.includes(reqId),
      );

      if (idsToAdd.length > 0) {
        const permsToAssign = await this.permissionRepository.findBy({
          id: In(idsToAdd),
        });

        // Link them to the current resource
        permsToAssign.forEach((p) => {
          p.resource = savedResource;
          p.updatedBy = user.id;
          p.updatedByName = user.fullName;
        });
        await this.permissionRepository.save(permsToAssign);
      }
    }

    const finalResource = await this.resourceRepository.findOne({
      where: { id: savedResource.id },
      relations: { permissions: true },
    });

    // Explicit manual cache clear to prevent frontend race conditions
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('resources:list:*');
      await this.cacheService.delPattern(`resource:${id}`);
      await this.cacheService.delPattern('permissions:list:*');
      await this.cacheService.del('permissions:matrix');
    }

    return finalResource!;
  }

  @CacheClear({
    key: (id: unknown) => [
      `resource:${id as string}`,
      'resources:available',
      'resources:list:*',
    ],
    isPattern: true,
  })
  async remove(id: string, user: ActiveUserData): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: {
        permissions: true,
      },
    });

    if (!resource)
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE, id),
      );

    if (resource.permissions && resource.permissions.length > 0) {
      throw new BadRequestException(
        MESSAGES.ERROR.HAS_DEPENDENCIES(
          RESOURCES.RESOURCE.BASE,
          resource.name,
          resource.permissions.length,
          RESOURCES.PERMISSION.PLURAL,
        ),
      );
    }

    resource.deletedBy = user.id;
    resource.deletedByName = user.fullName;
    await this.resourceRepository.save(resource);

    await this.resourceRepository.softRemove(resource);

    // Explicit manual cache clear
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('resources:list:*');
      await this.cacheService.del('permissions:matrix');
    }
  }

  @Cacheable({
    key: 'resources:available',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 604800,
  })
  async findAvailable(
    _bypassCache?: boolean,
  ): Promise<Partial<SystemResource>[]> {
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
    const resource = await this.resourceRepository.findOne({
      where: { id },
      relations: { permissions: true },
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
    if (dto.isLive === false) {
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

    resource.isLive = dto.isLive;
    resource.updatedBy = user.id;
    resource.updatedByName = user.fullName;
    const saved = await this.resourceRepository.save(resource);

    // Explicit manual cache clear
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('resources:list:*');
      await this.cacheService.delPattern('permissions:list:*');
      await this.cacheService.del('permissions:matrix');
    }

    return saved;
  }

  @Cacheable({
    key: 'resources:recycle-bin',
    forceRefresh: (bypassCache: unknown) => bypassCache === true,
    ttlSeconds: 3600,
  })
  async findRecycleBin(_bypassCache?: boolean): Promise<SystemResource[]> {
    return this.resourceRepository.find({
      where: {
        deletedAt: Not(IsNull()),
      },
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
    const resource = await this.resourceRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!resource) {
      throw new NotFoundException(
        MESSAGES.ERROR.NOT_FOUND(RESOURCES.RESOURCE.BASE, id),
      );
    }

    if (!resource.deletedAt) {
      throw new BadRequestException('This resource is not in the recycle bin.');
    }

    resource.deletedAt = null;
    resource.deletedBy = null;
    resource.deletedByName = null;
    resource.updatedBy = user.id;
    resource.updatedByName = user.fullName;

    const saved = await this.resourceRepository.save(resource);

    // Explicit manual cache clear
    if (this.cacheService.delPattern) {
      await this.cacheService.delPattern('resources:list:*');
      await this.cacheService.delPattern('permissions:list:*');
      await this.cacheService.del('permissions:matrix');
    }

    return saved;
  }
}
