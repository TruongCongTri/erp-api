import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { User } from 'src/users/entities/users.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { CacheService } from 'src/common/cache/cache.service';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';

export interface AuthenticatedUserContext {
  id: string;
  fullName: string;
}

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    readonly cacheService: CacheService,
  ) {}

  @CacheClear({
    key: ['departments:tree:*', 'departments:list:*', 'departments:available'],
    isPattern: true,
  })
  async create(
    dto: CreateDepartmentDto,
    user: AuthenticatedUserContext,
  ): Promise<Department> {
    // 1. Tối ưu SELECT: Chỉ lấy các trường cần kiểm tra trùng lặp
    const existing = await this.departmentRepo.findOne({
      where: [{ slug: dto.slug }, { code: dto.code }],
      select: { id: true, slug: true, code: true },
    });

    if (existing) {
      throw new ConflictException(
        existing.slug === dto.slug
          ? `Mã slug "${dto.slug}" đã được sử dụng.`
          : `Mã code "${dto.code}" đã được sử dụng.`,
      );
    }

    // if (dto.parentId) {
    //   const parent = await this.departmentRepo.findOneBy({ id: dto.parentId });
    //   if (!parent)
    //     throw new NotFoundException('Phòng ban cấp cha không tồn tại.');
    // }
    // 2. Dùng exists thay vì nạp cả bản ghi cha / trưởng phòng
    if (dto.parentId) {
      const parentExists = await this.departmentRepo.exists({
        where: { id: dto.parentId },
      });
      if (!parentExists) {
        throw new NotFoundException('Phòng ban cấp cha không tồn tại.');
      }
    }

    // if (dto.headUserId) {
    //   const head = await this.userRepo.findOneBy({ id: dto.headUserId });
    //   if (!head)
    //     throw new NotFoundException(
    //       'Người dùng chỉ định làm Trưởng bộ phận không tồn tại.',
    //     );
    // }
    if (dto.headUserId) {
      const headExists = await this.userRepo.exists({
        where: { id: dto.headUserId },
      });
      if (!headExists) {
        throw new NotFoundException(
          'Người dùng chỉ định làm Trưởng bộ phận không tồn tại.',
        );
      }
    }

    const department = this.departmentRepo.create({
      ...dto,
      createdBy: user.id,
      createdByName: user.fullName,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    const saved = await this.departmentRepo.save(department);

    // Đồng bộ phòng ban trực tiếp sang User nếu bổ nhiệm Trưởng phòng ngay khi tạo
    if (dto.headUserId) {
      await this.userRepo.update(dto.headUserId, {
        departmentId: saved.id,
        organizationId: saved.organizationId ?? undefined,
      });
    }

    return saved;
  }

  // async findAll(
  //   query: QueryDepartmentDto,
  // ): Promise<{ data: Department[]; meta: PaginationMetaDto }> {
  //   const qb = this.departmentRepo
  //     .createQueryBuilder('dept')
  //     .leftJoinAndSelect('dept.headUser', 'headUser')
  //     .leftJoinAndSelect('dept.parent', 'parent');

  //   if (query.search?.trim()) {
  //     qb.andWhere(
  //       '(dept.name ILIKE :search OR dept.code ILIKE :search OR dept.slug ILIKE :search)',
  //       { search: `%${query.search.trim()}%` },
  //     );
  //   }

  //   if (query.organizationId) {
  //     qb.andWhere('dept.organizationId = :orgId', {
  //       orgId: query.organizationId,
  //     });
  //   }

  //   if (query.isRootOnly) {
  //     qb.andWhere('dept.parentId IS NULL');
  //   } else if (query.parentId) {
  //     qb.andWhere('dept.parentId = :parentId', { parentId: query.parentId });
  //   }

  //   if (query.isActive !== undefined) {
  //     qb.andWhere('dept.isActive = :isActive', { isActive: query.isActive });
  //   }

  //   // Dynamic Sorter
  //   const sortField = query.sortBy || 'name';
  //   qb.orderBy(`dept.${sortField}`, query.sortOrder || 'ASC');

  //   // Pagination
  //   const page = Math.max(1, query.page || 1);
  //   const limit = Math.max(1, query.limit || 10);
  //   const skip = (page - 1) * limit;

  //   const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

  //   return {
  //     data,
  //     meta: PaginationMetaDto.create(page, limit, total),
  //   };
  // }

  @Cacheable({
    key: (query: unknown) => `departments:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: QueryDepartmentDto,
    _bypassCache?: boolean,
  ): Promise<{ data: Department[]; meta: PaginationMetaDto }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    // 3. Tối ưu Payload & Triệt tiêu nạp password của User:
    // Dùng leftJoin kèm select cụ thể thay cho leftJoinAndSelect
    const qb = this.departmentRepo
      .createQueryBuilder('dept')
      .leftJoin('dept.headUser', 'headUser')
      .leftJoin('dept.parent', 'parent')
      .select([
        'dept.id',
        'dept.slug',
        'dept.code',
        'dept.name',
        'dept.organizationId',
        'dept.headUserId',
        'dept.parentId',
        'dept.isActive',
        'dept.createdAt',
        'dept.updatedAt',
        'headUser.id',
        'headUser.fullName',
        'headUser.email',
        'headUser.avatarUrl',
        'parent.id',
        'parent.name',
        'parent.code',
        'parent.slug',
      ]);

    if (query.search?.trim()) {
      qb.andWhere(
        '(dept.name ILIKE :search OR dept.code ILIKE :search OR dept.slug ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    if (query.organizationId) {
      qb.andWhere('dept.organizationId = :orgId', {
        orgId: query.organizationId,
      });
    }

    if (query.isRootOnly) {
      qb.andWhere('dept.parentId IS NULL');
    } else if (query.parentId) {
      qb.andWhere('dept.parentId = :parentId', { parentId: query.parentId });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('dept.isActive = :isActive', { isActive: query.isActive });
    }

    const sortField = query.sortBy || 'name';
    const sortOrder =
      query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    qb.orderBy(`dept.${sortField}`, sortOrder);

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: PaginationMetaDto.create(page, limit, total),
    };
  }

  @Cacheable({
    key: (idOrSlug: unknown) => `department:${idOrSlug as string}`,
    forceRefresh: (_idOrSlug: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 86400,
  })
  async findOne(idOrSlug: string, _bypassCache?: boolean): Promise<Department> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    // const department = await this.departmentRepo.findOne({
    //   where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
    //   relations: { headUser: true, parent: true, children: true },
    // });
    // 4. Selective Projection cho chi tiết phòng ban
    const department = await this.departmentRepo.findOne({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      select: {
        id: true,
        slug: true,
        code: true,
        name: true,
        organizationId: true,
        headUserId: true,
        parentId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        headUser: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
        },
        parent: {
          id: true,
          name: true,
          code: true,
          slug: true,
        },
        children: {
          id: true,
          name: true,
          code: true,
          slug: true,
          isActive: true,
        },
      },
      relations: { headUser: true, parent: true, children: true },
    });

    if (!department) {
      throw new NotFoundException(
        `Không tìm thấy phòng ban với định danh: ${idOrSlug}`,
      );
    }

    return department;
  }

  @Cacheable({
    key: (slug: unknown) => `department:slug:${slug as string}`,
    forceRefresh: (_slug: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 86400,
  })
  async findBySlug(slug: string, _bypassCache?: boolean): Promise<Department> {
    return this.findOne(slug, _bypassCache);
  }

  // async findBySlug(slug: string): Promise<Department> {
  //   const department = await this.departmentRepo.findOne({
  //     where: { slug },
  //     relations: { headUser: true, parent: true, children: true },
  //   });

  //   if (!department) {
  //     throw new NotFoundException(`Phòng ban với Slug ${slug} không tồn tại.`);
  //   }

  //   return department;
  // }

  /**
   * Lấy cây cơ cấu tổ chức (Department Hierarchy Tree)
   */
  @Cacheable({
    key: (orgId: unknown) => `departments:tree:${(orgId as string) || 'all'}`,
    forceRefresh: (_orgId: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 86400,
  })
  async getTree(
    organizationId?: string,
    _bypassCache?: boolean,
  ): Promise<Department[]> {
    const whereCondition = organizationId
      ? { organizationId, isActive: true }
      : { isActive: true };

    // const allDepts = await this.departmentRepo.find({
    //   where: whereCondition,
    //   relations: { headUser: true },
    //   order: { name: 'ASC' },
    // });
    // 5. Chỉ lấy các trường cần thiết để dựng cây
    const allDepts = await this.departmentRepo.find({
      where: whereCondition,
      select: {
        id: true,
        code: true,
        name: true,
        slug: true,
        parentId: true,
        organizationId: true,
        isActive: true,
        headUserId: true,
        headUser: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
        },
      },
      relations: { headUser: true },
      order: { name: 'ASC' },
    });

    const deptMap = new Map<string, Department & { children: Department[] }>();
    allDepts.forEach((d) => deptMap.set(d.id, { ...d, children: [] }));

    const roots: Department[] = [];

    deptMap.forEach((node) => {
      if (node.parentId && deptMap.has(node.parentId)) {
        deptMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  @CacheClear({
    key: (id: unknown) => [
      `department:${id as string}`,
      'departments:tree:*',
      'departments:list:*',
    ],
    isPattern: true,
  })
  async update(
    id: string,
    dto: UpdateDepartmentDto,
    user: AuthenticatedUserContext,
  ): Promise<Department> {
    // const department = await this.findOne(id);
    // Kiểm tra nhanh với select gọn, không load children/parent
    const department = await this.departmentRepo.findOne({
      where: { id },
      select: { id: true, slug: true, parentId: true, headUserId: true },
    });

    // if (dto.parentId && dto.parentId === id) {
    //   throw new BadRequestException(
    //     'Phòng ban không thể nhận chính nó làm cấp cha.',
    //   );
    // }

    // if (dto.headUserId) {
    //   const head = await this.userRepo.findOneBy({ id: dto.headUserId });
    //   if (!head)
    //     throw new NotFoundException('Trưởng bộ phận chỉ định không tồn tại.');
    // }
    if (!department) {
      throw new NotFoundException(`Không tìm thấy phòng ban với ID: ${id}`);
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException(
        'Phòng ban không thể nhận chính nó làm cấp cha.',
      );
    }

    if (dto.parentId && dto.parentId !== department.parentId) {
      const parentExists = await this.departmentRepo.exists({
        where: { id: dto.parentId },
      });
      if (!parentExists) {
        throw new NotFoundException('Phòng ban cấp cha không tồn tại.');
      }
    }

    if (dto.headUserId && dto.headUserId !== department.headUserId) {
      const headExists = await this.userRepo.exists({
        where: { id: dto.headUserId },
      });
      if (!headExists) {
        throw new NotFoundException('Trưởng bộ phận chỉ định không tồn tại.');
      }
    }

    Object.assign(department, {
      ...dto,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    // return this.departmentRepo.save(department);
    const saved = await this.departmentRepo.save(department);

    if (dto.headUserId && dto.headUserId !== department.headUserId) {
      await this.userRepo.update(dto.headUserId, {
        departmentId: saved.id,
        organizationId: saved.organizationId ?? undefined,
      });
    }

    return saved;
  }

  @CacheClear({
    key: (deptId: unknown) => [
      `department:${deptId as string}`,
      'departments:tree:*',
      'departments:list:*',
    ],
    isPattern: true,
  })
  async assignHead(
    deptId: string,
    headUserId: string,
    user?: AuthenticatedUserContext,
  ): Promise<Department> {
    // const dept = await this.findOne(deptId);
    const dept = await this.departmentRepo.findOne({
      where: { id: deptId },
      select: { id: true, organizationId: true },
    });
    if (!dept) {
      throw new NotFoundException('Phòng ban không tồn tại.');
    }

    const userExists = await this.userRepo.exists({
      where: { id: headUserId },
    });
    if (!userExists) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    await this.departmentRepo.update(deptId, {
      headUserId,
      updatedBy: user?.id,
      updatedByName: user?.fullName,
    });

    await this.userRepo.update(headUserId, {
      departmentId: dept.id,
      organizationId: dept.organizationId ?? undefined,
    });

    dept.headUserId = headUserId;
    return dept;
  }

  @CacheClear({
    key: (id: unknown) => [
      `department:${id as string}`,
      'departments:tree:*',
      'departments:list:*',
    ],
    isPattern: true,
  })
  async remove(id: string, user?: AuthenticatedUserContext): Promise<void> {
    // const dept = await this.findOne(id);
    const deptExists = await this.departmentRepo.exists({ where: { id } });
    if (!deptExists) {
      throw new NotFoundException('Phòng ban không tồn tại.');
    }

    // const hasChildren = await this.departmentRepo.count({
    //   where: { parentId: id },
    // });
    // if (hasChildren > 0) {
    //   throw new BadRequestException(
    //     'Không thể xóa phòng ban đang có đơn vị cấp con trực thuộc.',
    //   );
    // }
    // 6. Dùng countBy trực tiếp trên cột khóa ngoại, tránh nạp thực thể
    const hasChildren = await this.departmentRepo.countBy({ parentId: id });
    if (hasChildren > 0) {
      throw new BadRequestException(
        'Không thể xóa phòng ban đang có đơn vị cấp con trực thuộc.',
      );
    }

    // const hasMembers = await this.userRepo.count({
    //   where: { departmentId: id },
    // });
    const hasMembers = await this.userRepo.countBy({ departmentId: id });
    if (hasMembers > 0) {
      throw new BadRequestException(
        'Không thể xóa phòng ban đang có nhân viên trực thuộc.',
      );
    }

    // dept.deletedBy = user?.id;
    // dept.deletedByName = user?.fullName;
    // await this.departmentRepo.save(dept);
    // await this.departmentRepo.softRemove(dept);

    await this.departmentRepo.update(id, {
      deletedBy: user?.id,
      deletedByName: user?.fullName,
    });
    await this.departmentRepo.softDelete(id);
  }
}
