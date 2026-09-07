import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { AddressService } from 'src/address/address.service';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { CacheService } from 'src/common/cache/cache.service';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { User } from 'src/users/entities/users.entity';
import { ProfileQueryDto } from './dto/profile-query.dto';
import {
  buildFindOptions,
  buildPaginationMeta,
} from 'src/common/utils/typeorm-query.util';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { PaginationMetaDto } from 'src/common/dto/pagination.dto';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmployeeProfile)
    private readonly profileRepository: Repository<EmployeeProfile>,
    private readonly addressService: AddressService,
    readonly cacheService: CacheService,
  ) {}

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

  private async verifySecureAccess(
    targetUserId: string,
    requester: ActiveUserData,
    dto: SecureAccessDto,
  ) {
    const requesterRecord = await this.userRepository.findOne({
      where: { id: requester.id },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!requesterRecord)
      throw new UnauthorizedException('Invalid credential confirmation.');

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      requesterRecord.passwordHash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credential confirmation.');

    const isSelf = requester.id === targetUserId;
    const isHR: boolean =
      requester.permissions?.includes('hr:read:any') ?? false;
    if (!isSelf && !isHR)
      throw new ForbiddenException(
        'You do not have permission to view profile data.',
      );
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
    // 1. Map custom exact-match filters
    const customFilters: FindOptionsWhere<EmployeeProfile> = {};

    if (query.isLive !== undefined) {
      customFilters.isLive = query.isLive;
    }
    if (query.department) {
      customFilters.department = query.department;
    }

    // 2. Build standard options (handles search, sort, and pagination)
    const findOptions = buildFindOptions<EmployeeProfile>({
      queryDto: query,
      searchableColumns: [
        'employeeCode',
        'jobTitle',
        'department',
        'phoneNumber',
      ],
      sortableColumns: [
        'employeeCode',
        'joinDate',
        'department',
        'isLive',
        'createdAt',
      ],
      defaultSort: 'createdAt',
      customFilters,
    });

    // 3. Merge relation loading so the UI table gets identity details and user claim status
    findOptions.relations = {
      identityCard: true,
      designatedRole: true,
      designatedBonusPermissions: true,
      user: true,
    };

    // 4. Execute standard TypeORM query
    const repo: Repository<EmployeeProfile> = this.profileRepository;
    const [items, total] = await repo.findAndCount(findOptions);

    return {
      data: items,
      meta: buildPaginationMeta(query, total),
    };
  }

  // For HR checking a pending claim
  async getProfileByCode(employeeCode: string) {
    const profile = await this.profileRepository.findOne({
      where: { employeeCode },
      relations: {
        identityCard: true,
        designatedRole: true,
        designatedBonusPermissions: true,
        user: true, // Let HR see if it's already linked to an account
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
    key: (id: unknown) => [`profile:${id as string}`, 'users:list:*'],
    isPattern: true,
  })
  async updateProfile(
    profileId: string,
    dto: UpdateEmployeeProfileDto,
    adminUser: ActiveUserData,
  ) {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: { identityCard: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    if (dto.permanentAddress)
      dto.permanentAddress = (await this.normalizeAddress(
        dto.permanentAddress,
      ))!;
    if (dto.temporaryAddress)
      dto.temporaryAddress = await this.normalizeAddress(dto.temporaryAddress);

    // Support nested identity card updates if your DTO handles it
    if (dto.cccdIssuePlace) {
      dto.cccdIssuePlace = await this.normalizeAddress(dto.cccdIssuePlace);
    }

    Object.assign(profile, dto);

    profile.updatedBy = adminUser.id;
    profile.updatedByName = adminUser.fullName;

    return this.profileRepository.save(profile);
  }

  // ==========================================
  // SECURE SELF-SERVICE ACCESS
  // ==========================================

  async getProfileSecurely(
    targetUserId: string,
    requester: ActiveUserData,
    dto: SecureAccessDto,
  ) {
    await this.verifySecureAccess(targetUserId, requester, dto);
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { profile: { identityCard: true } },
    });

    if (!user || !user.profile)
      throw new NotFoundException('Profile not found');
    return user.profile;
  }
}
