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
  ) {}

  async create(
    dto: CreateDepartmentDto,
    user: AuthenticatedUserContext,
  ): Promise<Department> {
    const existing = await this.departmentRepo.findOne({
      where: [{ slug: dto.slug }, { code: dto.code }],
    });

    if (existing) {
      throw new ConflictException(
        existing.slug === dto.slug
          ? `Mã slug "${dto.slug}" đã được sử dụng.`
          : `Mã code "${dto.code}" đã được sử dụng.`,
      );
    }

    if (dto.parentId) {
      const parent = await this.departmentRepo.findOneBy({ id: dto.parentId });
      if (!parent)
        throw new NotFoundException('Phòng ban cấp cha không tồn tại.');
    }

    if (dto.headUserId) {
      const head = await this.userRepo.findOneBy({ id: dto.headUserId });
      if (!head)
        throw new NotFoundException(
          'Người dùng chỉ định làm Trưởng bộ phận không tồn tại.',
        );
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

  async findAll(
    query: QueryDepartmentDto,
  ): Promise<{ data: Department[]; meta: PaginationMetaDto }> {
    const qb = this.departmentRepo
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.headUser', 'headUser')
      .leftJoinAndSelect('dept.parent', 'parent');

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

    // Dynamic Sorter
    const sortField = query.sortBy || 'name';
    qb.orderBy(`dept.${sortField}`, query.sortOrder || 'ASC');

    // Pagination
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 10);
    const skip = (page - 1) * limit;

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: PaginationMetaDto.create(page, limit, total),
    };
  }

  async findOne(idOrSlug: string): Promise<Department> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    const department = await this.departmentRepo.findOne({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      relations: { headUser: true, parent: true, children: true },
    });

    if (!department) {
      throw new NotFoundException(
        `Không tìm thấy phòng ban với định danh: ${idOrSlug}`,
      );
    }

    return department;
  }

  async findBySlug(slug: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({
      where: { slug },
      relations: { headUser: true, parent: true, children: true },
    });

    if (!department) {
      throw new NotFoundException(`Phòng ban với Slug ${slug} không tồn tại.`);
    }

    return department;
  }

  /**
   * Lấy cây cơ cấu tổ chức (Department Hierarchy Tree)
   */
  async getTree(organizationId?: string): Promise<Department[]> {
    const whereCondition = organizationId
      ? { organizationId, isActive: true }
      : { isActive: true };

    const allDepts = await this.departmentRepo.find({
      where: whereCondition,
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

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    user: AuthenticatedUserContext,
  ): Promise<Department> {
    const department = await this.findOne(id);

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException(
        'Phòng ban không thể nhận chính nó làm cấp cha.',
      );
    }

    if (dto.headUserId) {
      const head = await this.userRepo.findOneBy({ id: dto.headUserId });
      if (!head)
        throw new NotFoundException('Trưởng bộ phận chỉ định không tồn tại.');
    }

    Object.assign(department, {
      ...dto,
      updatedBy: user.id,
      updatedByName: user.fullName,
    });

    return this.departmentRepo.save(department);
  }

  async assignHead(
    deptId: string,
    headUserId: string,
    user?: AuthenticatedUserContext,
  ): Promise<Department> {
    const dept = await this.findOne(deptId);
    const targetUser = await this.userRepo.findOneBy({ id: headUserId });

    if (!targetUser) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    dept.headUserId = targetUser.id;
    dept.updatedBy = user?.id;
    dept.updatedByName = user?.fullName;

    const savedDept = await this.departmentRepo.save(dept);

    // Cập nhật departmentId vào tài khoản của Trưởng phòng
    await this.userRepo.update(targetUser.id, {
      departmentId: dept.id,
      organizationId: dept.organizationId ?? undefined,
    });

    return savedDept;
  }

  async remove(id: string, user?: AuthenticatedUserContext): Promise<void> {
    const dept = await this.findOne(id);

    const hasChildren = await this.departmentRepo.count({
      where: { parentId: id },
    });
    if (hasChildren > 0) {
      throw new BadRequestException(
        'Không thể xóa phòng ban đang có đơn vị cấp con trực thuộc.',
      );
    }

    const hasMembers = await this.userRepo.count({
      where: { departmentId: id },
    });
    if (hasMembers > 0) {
      throw new BadRequestException(
        'Không thể xóa phòng ban đang có nhân viên trực thuộc.',
      );
    }

    dept.deletedBy = user?.id;
    dept.deletedByName = user?.fullName;
    await this.departmentRepo.save(dept);
    await this.departmentRepo.softRemove(dept);
  }
}
