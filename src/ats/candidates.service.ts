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
  WhereExpressionBuilder,
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

export interface RoleObject {
  id?: string;
  name?: string;
  code?: string;
  slug?: string;
}

// interface RawDeptRow {
//   id?: string;
//   department_id?: string;
//   departmentId?: string;
// }

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @InjectRepository(CandidateProfile)
    private readonly candidateRepo: Repository<CandidateProfile>,
  ) {}

  // ========================================================
  // 1. QUERY ALL CANDIDATES (DÙNG CHO CANDIDATES MANAGEMENT PAGE)
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

    const qb: SelectQueryBuilder<CandidateProfile> = this.candidateRepo
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.applications', 'application')
      .leftJoinAndSelect('application.jobPost', 'jobPost')
      .leftJoinAndSelect('jobPost.recruitmentRequest', 'recruitmentRequest')
      .leftJoinAndSelect('recruitmentRequest.department', 'department')
      .leftJoinAndSelect('application.submissions', 'submission');

    // ── RBAC Scope Enforcement cho Candidates ──
    const canReadAny = hasPermission(user, 'ats_candidate', 'read', 'any');
    const canReadDept = hasPermission(user, 'ats_candidate', 'read', 'dept');

    if (!canReadAny) {
      const userDeptId = await getUserDepartmentId(
        this.candidateRepo.manager,
        user,
      );

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
    // 1. Tìm kiếm theo Tên, Email, Số điện thoại hoặc Kỹ năng
    if (search?.trim()) {
      const keyword = `%${search.trim()}%`;
      qb.andWhere(
        new Brackets((sub: WhereExpressionBuilder) => {
          sub
            .where('LOWER(candidate.fullName) LIKE LOWER(:keyword)', {
              keyword,
            })
            .orWhere('LOWER(candidate.email) LIKE LOWER(:keyword)', { keyword })
            .orWhere('candidate.phoneNumber LIKE :keyword', { keyword });
        }),
      );
    }

    // 2. Lọc theo trạng thái vòng tuyển dụng (ApplicationStatus)
    if (status) {
      qb.andWhere('application.status = :status', { status });
    }

    // 3. Lọc theo nguồn kênh ứng tuyển (PlatformSource)
    if (platform) {
      qb.andWhere('submission.platformSource = :platform', { platform });
    }

    // 4. Lọc theo tin tuyển dụng cụ thể (JobPostId)
    if (jobPostId) {
      qb.andWhere('application.jobPostId = :jobPostId', { jobPostId });
    }

    qb.orderBy(`candidate.${sortBy}`, sortOrder);
    qb.addOrderBy('application.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const meta = PaginationMetaDto.create(page, limit, total);

    return { data, meta };
  }

  // ========================================================
  // 2. GET CANDIDATE DETAIL (DÙNG CHO DRAWER & DETAIL PAGE)
  // ========================================================
  async findOne(id: string, user?: ExtendedUser): Promise<CandidateProfile> {
    const candidate = await this.candidateRepo
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.applications', 'application')
      .leftJoinAndSelect('application.jobPost', 'jobPost')
      .leftJoinAndSelect('jobPost.recruitmentRequest', 'recruitmentRequest')
      .leftJoinAndSelect('recruitmentRequest.department', 'department')
      .leftJoinAndSelect('application.submissions', 'submission')
      .where('candidate.id = :id', { id })
      .addOrderBy('application.createdAt', 'DESC')
      .addOrderBy('submission.createdAt', 'DESC')
      .getOne();

    if (!candidate) {
      throw new NotFoundException(`Không tìm thấy ứng viên với mã ID: ${id}`);
    }

    if (user) {
      await this.assertViewPermission(candidate, user);
    }

    return candidate;
  }

  private async assertViewPermission(
    candidate: CandidateProfile,
    user: ExtendedUser,
  ): Promise<void> {
    if (hasPermission(user, 'ats_candidate', 'read', 'any')) {
      return;
    }

    const canReadDept = hasPermission(user, 'ats_candidate', 'read', 'dept');

    const userDeptId = await getUserDepartmentId(
      this.candidateRepo.manager,
      user,
    );

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

  // ========================================================
  // 3. DEDUPLICATION & IDENTITY ENRICHMENT
  // ========================================================
  /**
   * Gọi thông thường (ngoài transaction độc lập)
   */
  async findOrCreateProfile(
    data: CandidateIdentityDto,
  ): Promise<CandidateProfile> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhone = data.phoneNumber.trim().replace(/\s+/g, '');

    // 1. Tìm kiếm tuyệt đối theo Email trước (Primary Anchor)
    let candidate = await this.candidateRepo
      .createQueryBuilder('c')
      .where('LOWER(c.email) = :email', { email: normalizedEmail })
      .getOne();

    // 2. Nếu không trùng Email, CHỈ đối chiếu Phone khi có SĐT thực tế (> 8 chữ số)
    if (!candidate && normalizedPhone && normalizedPhone.length >= 9) {
      candidate = await this.candidateRepo
        .createQueryBuilder('c')
        .where('c.phoneNumber = :phone', { phone: normalizedPhone })
        .getOne();
    }

    if (candidate) {
      // Deduplication Enrichment: Cập nhật các liên kết mới nếu hồ sơ cũ chưa có
      let hasUpdate = false;

      // Cập nhật SĐT nếu hồ sơ cũ chưa có mà lần này ứng viên mới cung cấp
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
      if (candidate.fullName !== data.fullName) {
        candidate.fullName = data.fullName;
        hasUpdate = true;
      }

      if (hasUpdate) {
        candidate = await this.candidateRepo.save(candidate);
        this.logger.log(
          `[Deduplication] Đã hợp nhất và cập nhật ứng viên: ${candidate.id}`,
        );
      }

      return candidate;
    }

    // Tạo hồ sơ danh tính toàn cục mới
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
   * Gọi bên trong Transaction của TypeORM thông qua EntityManager
   */
  async findOrCreateProfileWithManager(
    manager: EntityManager,
    data: CandidateIdentityDto,
  ): Promise<CandidateProfile> {
    const repo = manager.getRepository(CandidateProfile);
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhone = data.phoneNumber.trim().replace(/\s+/g, '');

    // 1. Tìm kiếm tuyệt đối theo Email trước (Primary Anchor)
    let candidate = await repo
      .createQueryBuilder('c')
      .where('LOWER(c.email) = :email', { email: normalizedEmail })
      .getOne();

    // 2. Nếu không trùng Email, đối chiếu Phone khi có SĐT thực tế (>= 9 chữ số)
    if (!candidate && normalizedPhone && normalizedPhone.length >= 9) {
      candidate = await repo
        .createQueryBuilder('c')
        .where('c.phoneNumber = :phone', { phone: normalizedPhone })
        .getOne();
    }

    if (candidate) {
      let hasUpdate = false;

      // Cập nhật thông tin mới nếu hồ sơ cũ chưa có
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
      if (candidate.fullName !== data.fullName) {
        candidate.fullName = data.fullName;
        hasUpdate = true;
      }

      if (hasUpdate) {
        candidate = await repo.save(candidate);
        this.logger.log(
          `[Deduplication] Đã hợp nhất và cập nhật ứng viên: ${candidate.id}`,
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
}
