import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { CandidateProfile } from './entities/candidate-profile.entity';
import { CandidateIdentityDto } from './dto/candidate-submission.dto';
import { QueryCandidatesDto } from './dto/candidate-query.dto';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
// import { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import {
  // isSuperAdmin,
  hasPermission,
  getUserDepartmentId,
  ExtendedUser,
} from '../common/utils/ats-rbac.util';
import { CacheService } from 'src/common/cache/cache.service';

// export interface RoleObject {
//   id?: string;
//   name?: string;
//   code?: string;
//   slug?: string;
// }

// interface RawDeptRow {
//   id?: string;
//   department_id?: string;
//   departmentId?: string;
// }

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);
  private readonly CACHE_PREFIX = 'ats:candidates';
  private readonly USER_DEPT_CACHE_PREFIX = 'user:department_scope';

  constructor(
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
    private readonly cacheService: CacheService,
  ) {}

  // ========================================================
  // 1. QUERY ALL CANDIDATES (OPTIMIZED LEAN LIST)
  // ========================================================
  async findAll(query: QueryCandidatesDto, user: ExtendedUser) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      search,
      status,
      platform,
      jobPostId,
    } = query;
    const skip = (page - 1) * limit;

    // Tiêu chí 2 & 3: Loại bỏ submissions khỏi danh sách để tránh tích Descartes (Cartesian explosion)
    // Chỉ join các bảng cần thiết với SELECT chỉ định
    const qb: SelectQueryBuilder<CandidateProfile> = this.candidateRepo
      .createQueryBuilder('candidate')
      .leftJoin('candidate.applications', 'application')
      .leftJoin('application.jobPost', 'jobPost')
      .leftJoin('jobPost.recruitmentRequest', 'recruitmentRequest')
      .select([
        'candidate.id',
        'candidate.fullName',
        'candidate.email',
        'candidate.phoneNumber',
        'candidate.linkedInUrl',
        'candidate.portfolioUrl',
        'candidate.createdAt',
        'candidate.updatedAt',
        // Thông tin ứng tuyển tóm tắt (Lean Application Summary)
        'application.id',
        'application.status',
        'application.aiScore',
        'application.aiTier',
        'application.createdAt',
        // Thông tin tin tuyển dụng tóm tắt
        'jobPost.id',
        'jobPost.jobCode',
        'jobPost.publicTitle',
      ]);

    // ── RBAC Scope Enforcement với Cached User Dept ──
    const canReadAny = hasPermission(user, 'ats_candidate', 'read', 'any');
    const canReadDept = hasPermission(user, 'ats_candidate', 'read', 'dept');

    if (!canReadAny) {
      const userDeptId = await this.getCachedUserDepartmentId(user);

      if (canReadDept && userDeptId) {
        // Trưởng phòng ban: Chỉ xem ứng viên đã ứng tuyển vào các vị trí thuộc phòng ban mình phụ trách
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where('recruitmentRequest.departmentId = :scopedDeptId', {
                scopedDeptId: userDeptId,
              })
              .orWhere('department.id = :scopedDeptId', {
                scopedDeptId: userDeptId,
              });
          }),
        );
      } else {
        qb.andWhere('1 = 0');
      }
    }
    // ── Tiêu chí 1: Tìm kiếm tối ưu tận dụng Index B-Tree ──
    if (search?.trim()) {
      const cleanSearch = search.trim();
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('candidate.fullName ILIKE :search', {
              search: `%${cleanSearch}%`,
            })
            .orWhere('candidate.email ILIKE :search', {
              search: `%${cleanSearch}%`,
            })
            .orWhere('candidate.phoneNumber LIKE :search', {
              search: `%${cleanSearch}%`,
            });
        }),
      );
    }

    // ── Bộ lọc trạng thái và vị trí tuyển dụng ──
    if (status) {
      qb.andWhere('application.status = :status', { status });
    }

    if (jobPostId) {
      qb.andWhere('application.jobPostId = :jobPostId', { jobPostId });
    }

    if (platform) {
      // Dùng EXISTS subquery thay vì JOIN submissions trực tiếp để giữ nguyên số lượng row phân trang
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM application_submissions sub 
          WHERE sub.application_id = application.id 
          AND sub.platform_source = :platform
        )`,
        { platform },
      );
    }

    // Tiêu chí 1: Whitelist sắp xếp theo Index để tránh File Sort đĩa
    const validSortFields = ['createdAt', 'fullName', 'email'];
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    qb.orderBy(`candidate.${safeSortBy}`, sortOrder);
    qb.addOrderBy('candidate.id', sortOrder);

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  // ========================================================
  // 2. GET CANDIDATE DETAIL (HOT CACHED)
  // ========================================================
  async findOne(id: string, user?: ExtendedUser): Promise<CandidateProfile> {
    const cacheKey = `${this.CACHE_PREFIX}:detail:${id}`;

    // Tiêu chí 4: Hot Read Cache
    let candidate = await this.cacheService.get<CandidateProfile>(cacheKey);

    if (!candidate) {
      // Chi tiết hồ sơ: Tải quan hệ có thứ tự, loại trừ các trường text lớn (đã select: false ở entity)
      candidate = await this.candidateRepo
        .createQueryBuilder('candidate')
        .leftJoinAndSelect('candidate.applications', 'application')
        .leftJoinAndSelect('application.jobPost', 'jobPost')
        .leftJoinAndSelect('jobPost.recruitmentRequest', 'recruitmentRequest')
        .leftJoinAndSelect('recruitmentRequest.department', 'department')
        .leftJoinAndSelect('application.submissions', 'submission')
        .where('candidate.id = :id', { id })
        .orderBy('application.createdAt', 'DESC')
        .addOrderBy('submission.createdAt', 'DESC')
        .getOne();

      if (!candidate) {
        throw new NotFoundException(`Không tìm thấy ứng viên với mã ID: ${id}`);
      }

      await this.cacheService.set(cacheKey, candidate, 300); // Cache 5 phút
    }

    if (user) {
      await this.assertViewPermission(candidate, user);
    }

    return candidate;
  }

  // ========================================================
  // 3. DEDUPLICATION & IDENTITY ENRICHMENT
  // ========================================================
  /**
   * Khử trùng lặp và đồng bộ danh tính ứng viên (Ngoài Transaction)
   */
  async findOrCreateProfile(
    data: CandidateIdentityDto,
  ): Promise<CandidateProfile> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhone = data.phoneNumber.trim().replace(/\s+/g, '');

    // Tiêu chí 1: Truy vấn c.email trực tiếp để ăn B-Tree Unique Index (Không dùng LOWER(c.email))
    let candidate = await this.candidateRepo
      .createQueryBuilder('c')
      .where('c.email = :email', { email: normalizedEmail })
      .getOne();

    // Đối chiếu tiếp số điện thoại nếu email chưa khớp và số điện thoại hợp lệ
    if (!candidate && normalizedPhone && normalizedPhone.length >= 9) {
      candidate = await this.candidateRepo
        .createQueryBuilder('c')
        .where('c.phoneNumber = :phone', { phone: normalizedPhone })
        .getOne();
    }

    if (candidate) {
      const isUpdated = this.enrichCandidateData(
        candidate,
        data,
        normalizedPhone,
      );
      if (isUpdated) {
        candidate = await this.candidateRepo.save(candidate);
        await this.invalidateCandidateCache(candidate.id);
        this.logger.log(
          `[Deduplication] Đã cập nhật ứng viên: ${candidate.id}`,
        );
      }
      return candidate;
    }

    // Tạo ứng viên mới
    const newCandidate = this.candidateRepo.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      linkedInUrl: data.linkedInUrl ?? null,
      portfolioUrl: data.portfolioUrl ?? null,
    });

    return this.candidateRepo.save(newCandidate);
  }

  /**
   * Khử trùng lặp và đồng bộ danh tính trong Transaction của TypeORM
   */
  async findOrCreateProfileWithManager(
    manager: EntityManager,
    data: CandidateIdentityDto,
  ): Promise<CandidateProfile> {
    const repo = manager.getRepository(CandidateProfile);
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhone = data.phoneNumber.trim().replace(/\s+/g, '');

    // Tiêu chí 1: Ăn B-Tree Unique Index
    let candidate = await repo
      .createQueryBuilder('c')
      .where('c.email = :email', { email: normalizedEmail })
      .getOne();

    if (!candidate && normalizedPhone && normalizedPhone.length >= 9) {
      candidate = await repo
        .createQueryBuilder('c')
        .where('c.phoneNumber = :phone', { phone: normalizedPhone })
        .getOne();
    }

    if (candidate) {
      const isUpdated = this.enrichCandidateData(
        candidate,
        data,
        normalizedPhone,
      );
      if (isUpdated) {
        candidate = await repo.save(candidate);
        await this.invalidateCandidateCache(candidate.id);
        this.logger.log(
          `[Deduplication] Đã cập nhật ứng viên trong Tx: ${candidate.id}`,
        );
      }
      return candidate;
    }

    // 3. Khởi tạo và lưu hồ sơ ứng viên mới trong Transaction
    const newCandidate = repo.create({
      fullName: data.fullName.trim(),
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      linkedInUrl: data.linkedInUrl ?? null,
      portfolioUrl: data.portfolioUrl ?? null,
    });

    return repo.save(newCandidate);
  }

  // ========================================================
  // 4. HELPER & CACHING UTILITIES
  // ========================================================

  private enrichCandidateData(
    candidate: CandidateProfile,
    data: CandidateIdentityDto,
    normalizedPhone: string,
  ): boolean {
    let hasUpdate = false;

    if (!candidate.phoneNumber && normalizedPhone) {
      candidate.phoneNumber = normalizedPhone;
      hasUpdate = true;
    }
    if (!candidate.linkedInUrl && data.linkedInUrl) {
      candidate.linkedInUrl = data.linkedInUrl;
      hasUpdate = true;
    }
    if (!candidate.portfolioUrl && data.portfolioUrl) {
      candidate.portfolioUrl = data.portfolioUrl;
      hasUpdate = true;
    }
    if (candidate.fullName !== data.fullName.trim()) {
      candidate.fullName = data.fullName.trim();
      hasUpdate = true;
    }

    return hasUpdate;
  }

  private async getCachedUserDepartmentId(
    user: ExtendedUser,
  ): Promise<string | null> {
    if (user.departmentId && user.departmentId !== 'GLOBAL') {
      return user.departmentId;
    }

    const cacheKey = `${this.USER_DEPT_CACHE_PREFIX}:${user.id}`;
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const deptId = await getUserDepartmentId(this.candidateRepo.manager, user);
    if (deptId) {
      await this.cacheService.set(cacheKey, deptId, 900); // 15 phút
    }

    return deptId ?? null;
  }

  private async invalidateCandidateCache(id: string): Promise<void> {
    try {
      await this.cacheService.del(`${this.CACHE_PREFIX}:detail:${id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to invalidate candidate cache: ${msg}`);
    }
  }

  private async assertViewPermission(
    candidate: CandidateProfile,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_candidate', 'read', 'any')) {
      return;
    }

    const canReadDept = hasPermission(user, 'ats_candidate', 'read', 'dept');
    const userDeptId = await this.getCachedUserDepartmentId(user);

    if (!canReadDept || !userDeptId) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập vào hồ sơ ứng viên này.',
      );
    }

    const hasAppliedToDept = candidate.applications?.some((app) => {
      const reqDeptId =
        app.jobPost?.recruitmentRequest?.departmentId ||
        app.jobPost?.recruitmentRequest?.department?.id;
      return reqDeptId === userDeptId;
    });

    if (!hasAppliedToDept) {
      throw new ForbiddenException(
        'Ứng viên này chưa ứng tuyển vào vị trí nào thuộc phòng ban của bạn phụ trách.',
      );
    }
  }
}
