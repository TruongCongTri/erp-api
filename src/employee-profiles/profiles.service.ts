import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { EmployeeProfile } from './entities/employee-profile.entity';
import { EmployeeFinancial } from './entities/employee-financial.entity';
import { EmployeeSalaryHistory } from './entities/employee-salary-history.entity';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { ProfileQueryDto } from './dto/profile-query.dto';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import { User } from 'src/users/entities/users.entity';
import { AddressService } from 'src/address/address.service';
import { CacheService } from 'src/common/cache/cache.service';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { buildPaginationMeta } from 'src/common/utils/typeorm-query.util';
import { CryptoUtil } from 'src/common/utils/crypto.util';
import { UpdateFinancialDto } from './dto/update-financial.dto';
import { CreateSalaryRecordDto } from './dto/create-salary-record.dto';

export interface DecryptedFinancialData {
  taxCode: string | null;
  socialInsuranceNumber: string | null;
}
export interface DecryptedSalaryRecord {
  id: string;
  baseSalary: number;
  extraSalary: number;
  totalSalary: number;
  currency: string;
  effectiveDate: Date;
  note?: string;
  isCurrent: boolean;
  createdAt: Date;
}
// export interface CreateSalaryRecordDto {
//   baseSalary: number;
//   extraSalary?: number;
//   currency?: string;
//   effectiveDate: string | Date;
//   note?: string;
// }
// export interface UpdateFinancialDto {
//   taxCode?: string;
//   socialInsuranceNumber?: string;
// }

@Injectable()
export class ProfilesService {
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmployeeProfile)
    private readonly profileRepository: Repository<EmployeeProfile>,
    @InjectRepository(EmployeeFinancial)
    private readonly financialRepository: Repository<EmployeeFinancial>,
    @InjectRepository(EmployeeSalaryHistory)
    private readonly salaryRepository: Repository<EmployeeSalaryHistory>,
    private readonly addressService: AddressService,
    private readonly configService: ConfigService,
    readonly cacheService: CacheService,
  ) {
    this.encryptionKey = this.configService.getOrThrow<string>(
      'DATA_ENCRYPTION_KEY',
    );
  }

  private async normalizeAddress(
    addressText?: string,
  ): Promise<string | undefined> {
    if (!addressText) return addressText;

    const result = await this.addressService.parseAndConvertText(addressText);

    if (result && result.inputType === 'old' && result.status === 'matched') {
      return result.convertedText;
    }

    return addressText;
  }

  /**
   * Xác thực Step-up Auth: Kiểm tra mật khẩu của requester & Quyền hạn truy cập
   */
  private async verifySecureAccess(
    targetProfileId: string,
    requester: ActiveUserData,
    passwordAttempt: string,
    requiredPermission = 'hr:read:financial', // TODO: might need update
  ): Promise<EmployeeProfile> {
    // 1. Kiểm tra mật khẩu tài khoản người gọi (Chỉ select id và passwordHash)
    const requesterUser = await this.userRepository.findOne({
      where: { id: requester.id },
      select: { id: true, passwordHash: true },
    });

    if (!requesterUser?.passwordHash) {
      throw new UnauthorizedException(
        'Thông tin xác nhận mật khẩu không chính xác.',
      );
    }

    const isMatch = await bcrypt.compare(
      passwordAttempt,
      requesterUser.passwordHash,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Mật khẩu xác nhận không chính xác.');
    }

    // 2. Tìm profile mục tiêu (Chỉ lấy id và user_id)
    const profile = await this.profileRepository.findOne({
      where: { id: targetProfileId },
      select: { id: true, employeeCode: true, user: { id: true } },
      relations: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    }

    // 3. Phân quyền: Chính chủ (Owner) hoặc Nhân sự có quyền hạn chỉ định
    const isOwner = profile.user?.id === requester.id;
    const hasPermission =
      requester.permissions?.includes(requiredPermission) ||
      requester.permissions?.includes('hr:manage:all');

    if (!isOwner && !hasPermission) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập thông tin tài chính/lương của hồ sơ này.',
      );
    }

    return profile;
  }

  // ==========================================
  // PROFILE MANAGEMENT (Independent of Auth)
  // ==========================================

  @Cacheable({
    key: (query: unknown) => `profiles:list:${JSON.stringify(query)}`,
    forceRefresh: (_query: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 3600,
  })
  async findAll(
    query: ProfileQueryDto,
    _bypassCache?: boolean,
  ): Promise<{ data: EmployeeProfile[]; meta: PaginationMetaDto }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    // Tối ưu Payload & Triệt tiêu N+1:
    // Dùng select cụ thể, TUYỆT ĐỐI KHÔNG JOIN bảng Financial & Salary khi load danh sách
    const qb = this.profileRepository
      .createQueryBuilder('profile')
      .leftJoin('profile.user', 'user')
      .leftJoin('profile.designatedDepartment', 'dept')
      .leftJoin('profile.designatedRole', 'role')
      .select([
        'profile.id',
        'profile.employeeCode',
        'profile.jobTitle',
        'profile.department',
        'profile.phoneNumber',
        'profile.joinDate',
        'profile.isLive',
        'profile.createdAt',
        'user.id',
        'user.fullName',
        'user.email',
        'user.status',
        'dept.id',
        'dept.name',
        'dept.code',
        'role.id',
        'role.name',
      ]);

    if (query.isLive !== undefined) {
      qb.andWhere('profile.isLive = :isLive', { isLive: query.isLive });
    }

    if (query.department) {
      qb.andWhere('profile.department = :dept', { dept: query.department });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(profile.employeeCode ILIKE :search OR profile.jobTitle ILIKE :search OR profile.phoneNumber ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`profile.${sortField}`, sortOrder);

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta(query, total),
    };
  }

  @Cacheable({
    key: (code: unknown) => `profile:code:${code as string}`,
    forceRefresh: (_code: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 86400,
  })
  async getProfileByCode(
    employeeCode: string,
    _bypassCache?: boolean,
  ): Promise<EmployeeProfile> {
    const profile = await this.profileRepository.findOne({
      where: { employeeCode },
      select: {
        id: true,
        employeeCode: true,
        jobTitle: true,
        department: true,
        phoneNumber: true,
        joinDate: true,
        gender: true,
        dateOfBirth: true,
        isLive: true,
        user: { id: true, fullName: true, email: true },
        designatedRole: { id: true, name: true, slug: true },
        designatedDepartment: { id: true, name: true, code: true },
      },
      relations: {
        user: true,
        designatedRole: true,
        designatedDepartment: true,
      },
    });

    if (!profile) {
      throw new NotFoundException(
        `Không tìm thấy hồ sơ với mã: ${employeeCode}`,
      );
    }
    return profile;
  }

  // Target the Profile ID directly instead of the User ID
  @CacheClear({
    key: (id: unknown) => [
      `profile:${id as string}`,
      'profile:code:*',
      'profiles:list:*',
      'users:list:*',
      `identity:profile:summary:${id as string}`,
    ],
    isPattern: true,
  })
  async updateProfile(
    profileId: string,
    dto: UpdateEmployeeProfileDto,
    adminUser: ActiveUserData,
  ): Promise<EmployeeProfile> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      select: { id: true },
    });

    if (!profile) throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');

    if (dto.permanentAddress)
      dto.permanentAddress = (await this.normalizeAddress(
        dto.permanentAddress,
      ))!;
    if (dto.temporaryAddress)
      dto.temporaryAddress = await this.normalizeAddress(dto.temporaryAddress);

    // Support nested identity card updates if your DTO handles it
    // if (dto.cccdIssuePlace) {
    //   dto.cccdIssuePlace = await this.normalizeAddress(dto.cccdIssuePlace);
    // }

    await this.profileRepository.update(profileId, {
      ...dto,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    return this.profileRepository.findOneOrFail({
      where: { id: profileId },
      relations: { designatedDepartment: true, designatedRole: true },
    });
  }

  // =========================================================================
  // SUB-MODULE 1: BẢO HIỂM & THUẾ (Mã hóa 2 chiều AES-GCM + Step-Up Auth)
  // =========================================================================

  /**
   * Xem dữ liệu Mã số thuế & BHXH (Chỉ giải mã in-memory, KHÔNG cache vào Redis)
   */
  async unlockFinancialData(
    profileId: string,
    dto: SecureAccessDto,
    requester: ActiveUserData,
  ): Promise<DecryptedFinancialData> {
    await this.verifySecureAccess(
      profileId,
      requester,
      dto.password,
      'hr:read:financial',
    );

    const fin = await this.financialRepository.findOne({
      where: { profileId },
      select: {
        id: true,
        taxCodeEncrypted: true,
        socialInsuranceNumberEncrypted: true,
      },
    });

    if (!fin) {
      return { taxCode: null, socialInsuranceNumber: null };
    }

    return {
      taxCode: fin.taxCodeEncrypted
        ? CryptoUtil.decrypt(fin.taxCodeEncrypted, this.encryptionKey)
        : null,
      socialInsuranceNumber: fin.socialInsuranceNumberEncrypted
        ? CryptoUtil.decrypt(
            fin.socialInsuranceNumberEncrypted,
            this.encryptionKey,
          )
        : null,
    };
  }

  /**
   * Cập nhật thông tin Thuế & BHXH (Tự động mã hóa trước khi ghi vào CSDL)
   */
  async updateFinancialData(
    profileId: string,
    dto: UpdateFinancialDto,
    adminUser: ActiveUserData,
  ): Promise<void> {
    await this.verifySecureAccess(
      profileId,
      adminUser,
      dto.passwordConfirm,
      'hr:update:financial',
    );

    let fin = await this.financialRepository.findOne({ where: { profileId } });
    if (!fin) {
      fin = this.financialRepository.create({ profileId });
    }

    if (dto.taxCode !== undefined) {
      fin.taxCodeEncrypted = dto.taxCode
        ? CryptoUtil.encrypt(dto.taxCode.trim(), this.encryptionKey)
        : null;
    }

    if (dto.socialInsuranceNumber !== undefined) {
      fin.socialInsuranceNumberEncrypted = dto.socialInsuranceNumber
        ? CryptoUtil.encrypt(
            dto.socialInsuranceNumber.trim(),
            this.encryptionKey,
          )
        : null;
    }

    fin.updatedBy = adminUser.id;
    fin.updatedByName = adminUser.fullName;

    await this.financialRepository.save(fin);
  }

  // =========================================================================
  // SUB-MODULE 2: LỊCH SỬ THU NHẬP & MỨC LƯƠNG (Salary Timeline + Step-Up Auth)
  // =========================================================================

  /**
   * Xem toàn bộ lịch sử thay đổi lương của nhân viên (Sắp xếp theo ngày hiệu lực)
   */
  async unlockSalaryHistory(
    profileId: string,
    dto: SecureAccessDto,
    requester: ActiveUserData,
  ): Promise<DecryptedSalaryRecord[]> {
    await this.verifySecureAccess(
      profileId,
      requester,
      dto.password,
      'hr:read:salary',
    );

    // Truy vấn có Index Scan trên idx_salary_history_profile_date
    const histories = await this.salaryRepository.find({
      where: { profileId },
      select: {
        id: true,
        baseSalaryEncrypted: true,
        extraSalaryEncrypted: true,
        currency: true,
        effectiveDate: true,
        note: true,
        isCurrent: true,
        createdAt: true,
      },
      order: { effectiveDate: 'DESC' },
    });

    return histories.map((record) => {
      const base = Number(
        CryptoUtil.decrypt(record.baseSalaryEncrypted, this.encryptionKey) || 0,
      );
      const extra = Number(
        CryptoUtil.decrypt(record.extraSalaryEncrypted, this.encryptionKey) ||
          0,
      );
      return {
        id: record.id,
        baseSalary: base,
        extraSalary: extra,
        totalSalary: base + extra,
        currency: record.currency,
        effectiveDate: record.effectiveDate,
        note: record.note,
        isCurrent: record.isCurrent,
        createdAt: record.createdAt,
      };
    });
  }

  /**
   * Thêm một mốc điều chỉnh lương mới (Được lưu dạng bản ghi lịch sử, cập nhật isCurrent)
   */
  async addSalaryAdjustment(
    profileId: string,
    dto: CreateSalaryRecordDto,
    adminUser: ActiveUserData,
  ): Promise<void> {
    await this.verifySecureAccess(
      profileId,
      adminUser,
      dto.passwordConfirm,
      'hr:manage:salary',
    );

    if (dto.baseSalary < 0) {
      throw new BadRequestException('Mức lương cơ bản không thể âm.');
    }

    // 1. Chuyển toàn bộ các bản ghi cũ của profile này thành isCurrent = false
    await this.salaryRepository.update(
      { profileId, isCurrent: true },
      { isCurrent: false },
    );

    // 2. Mã hóa dữ liệu lương
    const baseEncrypted = CryptoUtil.encrypt(
      dto.baseSalary,
      this.encryptionKey,
    );
    const extraEncrypted = CryptoUtil.encrypt(
      dto.extraSalary || 0,
      this.encryptionKey,
    );

    // 3. Tạo bản ghi lịch sử mới (isCurrent = true)
    const newSalary = this.salaryRepository.create({
      profileId,
      baseSalaryEncrypted: baseEncrypted,
      extraSalaryEncrypted: extraEncrypted,
      currency: dto.currency || 'VND',
      effectiveDate: new Date(dto.effectiveDate),
      note: dto.note || 'Điều chỉnh mức lương',
      isCurrent: true,
      createdBy: adminUser.id,
      createdByName: adminUser.fullName,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    await this.salaryRepository.save(newSalary);
  }

  // ==========================================
  // SECURE SELF-SERVICE ACCESS
  // ==========================================

  // async getProfileSecurely(
  //   targetUserId: string,
  //   requester: ActiveUserData,
  //   dto: SecureAccessDto,
  // ) {
  //   await this.verifySecureAccess(targetUserId, requester, dto);
  //   const user = await this.userRepository.findOne({
  //     where: { id: targetUserId },
  //     relations: { profile: { identityCard: true } },
  //   });

  //   if (!user || !user.profile)
  //     throw new NotFoundException('Profile not found');
  //   return user.profile;
  // }
}
