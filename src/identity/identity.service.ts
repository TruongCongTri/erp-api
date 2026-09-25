import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/users/entities/users.entity';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { SecureAccessDto } from 'src/common/dto/secure-access.dto';
import {
  CitizenIdentityCard,
  IdentityCardStatus,
} from './entities/citizen-identity.entity';
import { UpdateCitizenIdentityDto } from './dto/update-citizen-identity.dto';
import { Gender } from './enums/citizen-identity.enum';
import { ConfigService } from '@nestjs/config';
import { CacheService } from 'src/common/cache/cache.service';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';
import { CreateBasicIdentityDto } from './dto/create-basic-identity.dto';
import { CryptoUtil } from 'src/common/utils/crypto.util';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { ApplyQrIdentityDto } from './dto/apply-qr-identity.dto';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';

export interface DecryptedIdentityCard {
  id: string;
  cccdNumber: string;
  fullName: string;
  dateOfBirth: Date;
  gender: Gender;
  nationality: string;
  ethnicity?: string;
  religion?: string;
  placeOfOrigin?: string;
  placeOfResidence: string;
  temporaryAddress?: string;
  personalIdentification?: string | null;
  dateOfIssue?: Date;
  dateOfExpiry?: Date;
  placeOfIssue?: string;
  status: IdentityCardStatus;
  updatedAt: Date;
}

export interface MaskedIdentitySummary {
  id: string;
  maskedCccd: string;
  fullName: string;
  status: IdentityCardStatus;
  hasExpired: boolean;
  dateOfExpiry?: Date;
}

@Injectable()
export class IdentityService {
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmployeeProfile)
    private readonly profileRepository: Repository<EmployeeProfile>,
    @InjectRepository(CitizenIdentityCard)
    private readonly cccdRepository: Repository<CitizenIdentityCard>,
    private readonly configService: ConfigService,
    readonly cacheService: CacheService,
  ) {
    this.encryptionKey = this.configService.getOrThrow<string>(
      'DATA_ENCRYPTION_KEY',
    );
  }

  /**
   * Step-up Authentication: Kiểm tra mật khẩu & Phân quyền truy cập dữ liệu CCCD
   */
  private async verifySecureAccess(
    targetUserId: string,
    requester: ActiveUserData,
    passwordAttempt: string,
  ): Promise<void> {
    // Tối ưu Payload: Chỉ nạp trường passwordHash từ bảng User
    const requesterUser = await this.userRepository.findOne({
      where: { id: requester.id },
      select: { id: true, passwordHash: true },
    });

    if (!requesterUser?.passwordHash) {
      throw new UnauthorizedException('Thông tin xác thực không hợp lệ.');
    }

    const isPasswordValid = await bcrypt.compare(
      passwordAttempt,
      requesterUser.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu xác nhận không chính xác.');
    }
    // Enforce Self or HR
    const isSelf = requester.id === targetUserId;
    const isHR =
      requester.permissions?.includes('hr:read:any') ||
      requester.permissions?.includes('hr:manage:all');
    if (!isSelf && !isHR)
      throw new ForbiddenException(
        'You do not have permission to view this sensitive data.',
      );
  }

  // async createCccd(
  //   userId: string,
  //   dto: CreateCitizenIdentityDto,
  //   adminUser: ActiveUserData,
  // ): Promise<CitizenIdentityCard> {
  //   // 1. Fetch user to ensure they exist and have an Employee Profile
  //   const user = await this.userRepository.findOne({
  //     where: { id: userId },
  //     relations: { profile: { identityCard: true } },
  //   });

  //   if (!user) throw new NotFoundException('User not found');
  //   if (!user.profile) {
  //     throw new BadRequestException(
  //       'Cannot add CCCD. User must have an Employee Profile first.',
  //     );
  //   }
  //   if (user.profile.identityCard) {
  //     throw new ConflictException(
  //       'User already has a CCCD. Please use the update endpoint.',
  //     );
  //   }

  //   // 2. Prevent duplicate CCCD Numbers across the entire database
  //   const existingCccd = await this.cccdRepository.findOneBy({
  //     cccdNumber: dto.cccdNumber,
  //   });
  //   if (existingCccd) {
  //     throw new ConflictException(
  //       `CCCD Number ${dto.cccdNumber} is already registered in the system.`,
  //     );
  //   }

  //   // 3. Create the CCCD entity with Audit Trails
  //   const newCccd = this.cccdRepository.create({
  //     ...dto,
  //     createdBy: adminUser.id,
  //     createdByName: adminUser.fullName,
  //     updatedBy: adminUser.id,
  //     updatedByName: adminUser.fullName,
  //   });

  //   // 4. Save the CCCD independently first
  //   const savedCccd = await this.cccdRepository.save(newCccd);

  //   // 5. Link it to the Profile and save the User (Cascades the update to the profile)
  //   user.profile.identityCard = savedCccd;
  //   user.profile.updatedBy = adminUser.id;
  //   user.profile.updatedByName = adminUser.fullName;
  //   await this.userRepository.save(user);

  //   return savedCccd;
  // }
  // 1. TẠO HỒ SƠ CƠ BẢN (Manual Minimal Ingestion - Hỗ trợ nhập trước bổ sung sau)
  @CacheClear({
    key: (profileId: unknown) => [
      `identity:profile:${profileId as string}`,
      'profiles:list:*',
    ],
    isPattern: true,
  })
  async createBasicCccd(
    profileId: string,
    dto: CreateBasicIdentityDto,
    adminUser: ActiveUserData,
  ): Promise<{ id: string; maskedCccd: string }> {
    // 1. Kiểm tra EmployeeProfile (Chỉ select trường cần thiết, tránh N+1 và tránh join bảng lớn)
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      select: { id: true, employeeCode: true, identityCard: { id: true } },
      relations: { identityCard: true },
    });

    if (!profile) {
      throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    }

    if (profile.identityCard) {
      throw new ConflictException(
        'Hồ sơ nhân sự này đã được liên kết với một thẻ CCCD. Vui lòng dùng tính năng cập nhật.',
      );
    }

    // 2. Chống trùng lặp O(1) qua Blind Index mà không cần quét tuần tự (Index Scan)
    const cccdHash = CryptoUtil.generateBlindIndex(
      dto.cccdNumber,
      this.encryptionKey,
    );
    const existing = await this.cccdRepository.findOne({
      where: { cccdNumberHash: cccdHash },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Số CCCD này đã tồn tại trên hệ thống trong một hồ sơ khác.`,
      );
    }

    // 3. Mã hóa 2 chiều AES-256-GCM
    const encryptedNumber = CryptoUtil.encrypt(
      dto.cccdNumber,
      this.encryptionKey,
    );
    const lastFour = dto.cccdNumber.slice(-4);

    const newCard = this.cccdRepository.create({
      cccdNumberHash: cccdHash,
      cccdNumberEncrypted: encryptedNumber,
      cccdLastFour: lastFour,
      fullName: dto.fullName.trim(),
      dateOfBirth: new Date(dto.dateOfBirth),
      gender: dto.gender,
      placeOfResidence: dto.placeOfResidence.trim(),
      status: IdentityCardStatus.DRAFT,
      createdBy: adminUser.id,
      createdByName: adminUser.fullName,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    const savedCard = await this.cccdRepository.save(newCard);

    // 4. Gán trực tiếp ID vào Profile mà không gọi cascade toàn bộ User
    await this.profileRepository.update(profileId, {
      identityCard: { id: savedCard.id },
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    return {
      id: savedCard.id,
      maskedCccd: `********${lastFour}`,
    };
  }

  // 2. CẬP NHẬT QUA QUÉT MÃ QR (QR Scanner Ingestion & Auto-Completion)
  @CacheClear({
    key: (profileId: unknown) => [
      `identity:profile:${profileId as string}`,
      'profiles:list:*',
    ],
    isPattern: true,
  })
  async applyQrCodeData(
    profileId: string,
    dto: ApplyQrIdentityDto,
    currentUser: ActiveUserData,
  ): Promise<{ success: boolean; status: IdentityCardStatus }> {
    const parsed = this.parseCccdQr(dto.rawQrString);

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      select: { id: true, identityCard: { id: true } },
      relations: { identityCard: true },
    });

    if (!profile) {
      throw new NotFoundException('Hồ sơ nhân viên không tồn tại.');
    }

    const cccdHash = CryptoUtil.generateBlindIndex(
      parsed.cccdNumber,
      this.encryptionKey,
    );

    let card = profile.identityCard
      ? await this.cccdRepository.findOne({
          where: { id: profile.identityCard.id },
        })
      : null;

    if (card && card.cccdNumberHash !== cccdHash) {
      // Nếu số CCCD từ QR khác với số đã tạo nháp, kiểm tra trùng lặp với hồ sơ khác
      const duplicate = await this.cccdRepository.findOne({
        where: { cccdNumberHash: cccdHash },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== card.id) {
        throw new ConflictException(
          'Số CCCD trong mã QR đã được đăng ký bởi một nhân viên khác.',
        );
      }
    }

    if (!card) {
      card = this.cccdRepository.create({
        createdBy: currentUser.id,
        createdByName: currentUser.fullName,
      });
    }

    // Cập nhật và mã hóa toàn bộ dữ liệu trích xuất từ QR
    card.cccdNumberHash = cccdHash;
    card.cccdNumberEncrypted = CryptoUtil.encrypt(
      parsed.cccdNumber,
      this.encryptionKey,
    );
    card.cccdLastFour = parsed.cccdNumber.slice(-4);
    card.fullName = parsed.fullName;
    card.dateOfBirth = new Date(parsed.dateOfBirth);
    card.gender = parsed.gender;
    card.placeOfResidence = parsed.placeOfResidence;
    card.dateOfIssue = new Date(parsed.dateOfIssue);

    // Tính toán thời hạn thẻ CCCD theo Luật Căn cước Việt Nam (25, 40, 60 tuổi)
    card.dateOfExpiry = this.calculateCccdExpiry(
      card.dateOfBirth,
      card.dateOfIssue,
    );

    card.rawQrDataEncrypted = CryptoUtil.encrypt(
      dto.rawQrString,
      this.encryptionKey,
    );
    card.status = IdentityCardStatus.VERIFIED;
    card.updatedBy = currentUser.id;
    card.updatedByName = currentUser.fullName;

    const savedCard = await this.cccdRepository.save(card);

    if (!profile.identityCard) {
      await this.profileRepository.update(profileId, {
        identityCard: { id: savedCard.id },
        updatedBy: currentUser.id,
        updatedByName: currentUser.fullName,
      });
    }

    return { success: true, status: IdentityCardStatus.VERIFIED };
  }

  // async updateCccd(
  //   userId: string,
  //   dto: UpdateCitizenIdentityDto,
  //   adminUser: ActiveUserData,
  // ): Promise<CitizenIdentityCard> {
  //   const user = await this.userRepository.findOne({
  //     where: { id: userId },
  //     relations: { profile: { identityCard: true } },
  //   });

  //   if (!user || !user.profile?.identityCard) {
  //     throw new NotFoundException('CCCD data not found to update.');
  //   }

  //   // Check for CCCD Number collision if they are trying to change it
  //   if (
  //     dto.cccdNumber &&
  //     dto.cccdNumber !== user.profile.identityCard.cccdNumber
  //   ) {
  //     const existing = await this.cccdRepository.findOneBy({
  //       cccdNumber: dto.cccdNumber,
  //     });
  //     if (existing)
  //       throw new ConflictException(
  //         `CCCD Number ${dto.cccdNumber} is already registered.`,
  //       );
  //   }

  //   Object.assign(user.profile.identityCard, dto);

  //   // Audit Trail
  //   user.profile.identityCard.updatedBy = adminUser.id;
  //   user.profile.identityCard.updatedByName = adminUser.fullName;

  //   return this.cccdRepository.save(user.profile.identityCard);
  // }

  // async getCccdSecurely(
  //   targetUserId: string,
  //   requester: ActiveUserData,
  //   dto: SecureAccessDto,
  // ) {
  //   await this.verifySecureAccess(targetUserId, requester, dto);

  //   const user = await this.userRepository.findOne({
  //     where: { id: targetUserId },
  //     relations: { profile: { identityCard: true } },
  //   });

  //   if (!user || !user.profile?.identityCard)
  //     throw new NotFoundException('CCCD data not found');
  //   return user.profile.identityCard;
  // }

  // parseCccdQr(rawQrString: string) {
  //   try {
  //     const parts = rawQrString.split('|');
  //     if (parts.length < 7) throw new Error();
  //     return {
  //       cccdNumber: parts[0],
  //       oldId: parts[1],
  //       fullName: parts[2],
  //       dateOfBirth: `${parts[3].slice(4, 8)}-${parts[3].slice(2, 4)}-${parts[3].slice(0, 2)}`,
  //       gender: parts[4],
  //       placeOfResidence: parts[5],
  //       dateOfIssue: `${parts[6].slice(4, 8)}-${parts[6].slice(2, 4)}-${parts[6].slice(0, 2)}`,
  //     };
  //   } catch (_e) {
  //     throw new BadRequestException('Invalid CCCD QR Code format');
  //   }
  // }

  // 3. TRUY VẤN BẢO MẬT & TỐI ƯU PAYLOAD RESTFUL
  /**
   * Xem tóm tắt an toàn (Public/HR Table View): Không cần giải mã, có thể Cache
   */
  @Cacheable({
    key: (profileId: unknown) =>
      `identity:profile:summary:${profileId as string}`,
    ttlSeconds: 86400,
  })
  async getIdentitySummary(
    profileId: string,
  ): Promise<MaskedIdentitySummary | null> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      select: {
        id: true,
        identityCard: {
          id: true,
          cccdLastFour: true,
          fullName: true,
          status: true,
          dateOfExpiry: true,
        },
      },
      relations: { identityCard: true },
    });

    if (!profile?.identityCard) return null;

    const card = profile.identityCard;
    const now = new Date();
    const hasExpired = card.dateOfExpiry
      ? new Date(card.dateOfExpiry) < now
      : false;

    return {
      id: card.id,
      maskedCccd: `********${card.cccdLastFour}`,
      fullName: card.fullName,
      status: card.status,
      hasExpired,
      dateOfExpiry: card.dateOfExpiry,
    };
  }

  /**
   * Mở khóa xem toàn bộ CCCD: Yêu cầu mật khẩu xác thực (Step-up Auth)
   * TUYỆT ĐỐI KHÔNG LƯU KẾT QUẢ VÀO REDIS CACHE.
   */
  async getCccdSecurely(
    targetUserId: string,
    requester: ActiveUserData,
    dto: SecureAccessDto,
  ): Promise<DecryptedIdentityCard> {
    await this.verifySecureAccess(targetUserId, requester, dto.password);

    // Truy vấn chỉ lấy các cột cần thiết qua JOIN trực tiếp 1 lần (Triệt tiêu N+1)
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      select: {
        id: true,
        profile: {
          id: true,
          identityCard: {
            id: true,
            cccdNumberEncrypted: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            nationality: true,
            ethnicity: true,
            religion: true,
            placeOfOrigin: true,
            placeOfResidence: true,
            temporaryAddress: true,
            personalIdentificationEncrypted: true,
            dateOfIssue: true,
            dateOfExpiry: true,
            placeOfIssue: true,
            status: true,
            updatedAt: true,
          },
        },
      },
      relations: { profile: { identityCard: true } },
    });

    const card = user?.profile?.identityCard;
    if (!card) {
      throw new NotFoundException(
        'Dữ liệu Căn cước công dân chưa được khởi tạo.',
      );
    }

    // Giải mã in-memory trực tiếp trước khi trả về client
    return {
      id: card.id,
      cccdNumber: CryptoUtil.decrypt(
        card.cccdNumberEncrypted,
        this.encryptionKey,
      ),
      fullName: card.fullName,
      dateOfBirth: card.dateOfBirth,
      gender: card.gender,
      nationality: card.nationality,
      ethnicity: card.ethnicity,
      religion: card.religion,
      placeOfOrigin: card.placeOfOrigin,
      placeOfResidence: card.placeOfResidence,
      temporaryAddress: card.temporaryAddress,
      personalIdentification: card.personalIdentificationEncrypted
        ? CryptoUtil.decrypt(
            card.personalIdentificationEncrypted,
            this.encryptionKey,
          )
        : null,
      dateOfIssue: card.dateOfIssue,
      dateOfExpiry: card.dateOfExpiry,
      placeOfIssue: card.placeOfIssue,
      status: card.status,
      updatedAt: card.updatedAt,
    };
  }

  // =========================================================================
  // 4. CẬP NHẬT THỦ CÔNG & TIỆN ÍCH PHÂN TÍCH QR
  // =========================================================================

  @CacheClear({
    key: (profileId: unknown) => [
      `identity:profile:${profileId as string}`,
      'profiles:list:*',
    ],
    isPattern: true,
  })
  async updateCccd(
    profileId: string,
    dto: UpdateCitizenIdentityDto,
    adminUser: ActiveUserData,
  ): Promise<void> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      select: { id: true, identityCard: { id: true } },
      relations: { identityCard: true },
    });

    if (!profile?.identityCard) {
      throw new NotFoundException('Hồ sơ CCCD không tồn tại để cập nhật.');
    }

    const cardId = profile.identityCard.id;
    // 1. Ánh xạ các trường thủ công, chuyển đổi string -> Date chuẩn type-safe
    const updatePayload: Partial<CitizenIdentityCard> = {
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    };

    if (dto.fullName) updatePayload.fullName = dto.fullName.trim();
    if (dto.dateOfBirth) updatePayload.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender) updatePayload.gender = dto.gender;
    if (dto.nationality) updatePayload.nationality = dto.nationality.trim();
    if (dto.ethnicity !== undefined) updatePayload.ethnicity = dto.ethnicity;
    if (dto.religion !== undefined) updatePayload.religion = dto.religion;
    if (dto.placeOfOrigin !== undefined)
      updatePayload.placeOfOrigin = dto.placeOfOrigin;
    if (dto.placeOfResidence)
      updatePayload.placeOfResidence = dto.placeOfResidence.trim();
    if (dto.temporaryAddress !== undefined)
      updatePayload.temporaryAddress = dto.temporaryAddress;
    if (dto.dateOfIssue) updatePayload.dateOfIssue = new Date(dto.dateOfIssue);
    if (dto.dateOfExpiry)
      updatePayload.dateOfExpiry = new Date(dto.dateOfExpiry);
    if (dto.placeOfIssue !== undefined)
      updatePayload.placeOfIssue = dto.placeOfIssue;

    // 2. Xử lý mã hóa & Blind Index nếu thay đổi số CCCD
    if (dto.cccdNumber) {
      const cccdHash = CryptoUtil.generateBlindIndex(
        dto.cccdNumber,
        this.encryptionKey,
      );
      const existing = await this.cccdRepository.findOne({
        where: { cccdNumberHash: cccdHash },
        select: { id: true },
      });

      if (existing && existing.id !== cardId) {
        throw new ConflictException(
          'Số CCCD mới đã tồn tại trên một hồ sơ khác.',
        );
      }

      updatePayload.cccdNumberHash = cccdHash;
      updatePayload.cccdNumberEncrypted = CryptoUtil.encrypt(
        dto.cccdNumber,
        this.encryptionKey,
      );
      updatePayload.cccdLastFour = dto.cccdNumber.slice(-4);
    }

    // 3. Xử lý mã hóa đặc điểm nhận dạng
    if (dto.personalIdentification !== undefined) {
      updatePayload.personalIdentificationEncrypted = dto.personalIdentification
        ? CryptoUtil.encrypt(dto.personalIdentification, this.encryptionKey)
        : null;
    }

    await this.cccdRepository.update(cardId, updatePayload);
  }

  /**
   * Phân tích cú pháp chuỗi QR Code chuẩn Bộ Công An Việt Nam
   * Định dạng: CCCD|CMND cũ|Họ và tên|Ngày sinh(DDMMYYYY)|Giới tính|Địa chỉ thường trú|Ngày cấp(DDMMYYYY)
   */
  parseCccdQr(rawQrString: string): {
    cccdNumber: string;
    oldId: string;
    fullName: string;
    dateOfBirth: string;
    gender: Gender;
    placeOfResidence: string;
    dateOfIssue: string;
  } {
    try {
      if (!rawQrString || typeof rawQrString !== 'string') {
        throw new Error();
      }

      const parts = rawQrString.split('|');
      if (parts.length < 7) {
        throw new Error();
      }

      const rawDob = parts[3]; // DDMMYYYY
      const rawDoi = parts[6]; // DDMMYYYY

      const dobIso = `${rawDob.slice(4, 8)}-${rawDob.slice(2, 4)}-${rawDob.slice(0, 2)}`;
      const doiIso = `${rawDoi.slice(4, 8)}-${rawDoi.slice(2, 4)}-${rawDoi.slice(0, 2)}`;

      const genderRaw = parts[4].trim().toLowerCase();
      let gender: Gender;
      if (genderRaw === 'nam' || genderRaw === 'male') {
        gender = Gender.MALE;
      } else if (
        genderRaw === 'nữ' ||
        genderRaw === 'nu' ||
        genderRaw === 'female'
      ) {
        gender = Gender.FEMALE;
      } else {
        throw new BadRequestException(
          'Giới tính trên mã QR CCCD không hợp lệ (theo luật Căn cước Việt Nam chỉ chấp nhận Nam/Nữ).',
        );
      }

      return {
        cccdNumber: parts[0].trim(),
        oldId: parts[1].trim(),
        fullName: parts[2].trim(),
        dateOfBirth: dobIso,
        gender,
        placeOfResidence: parts[5].trim(),
        dateOfIssue: doiIso,
      };
    } catch {
      throw new BadRequestException(
        'Định dạng chuỗi mã QR CCCD không hợp lệ hoặc bị rách/mờ.',
      );
    }
  }

  /**
   * Tính ngày hết hạn CCCD theo quy định Điều 21 Luật Căn cước (Đổi thẻ ở tuổi 25, 40, 60)
   */
  private calculateCccdExpiry(dob: Date, issueDate: Date): Date {
    const birthYear = dob.getFullYear();
    const ageAtIssue = issueDate.getFullYear() - birthYear;

    let targetMilestoneAge = 25;
    if (ageAtIssue >= 60) {
      // Trên 60 tuổi được miễn đổi thẻ đến khi qua đời (Cấp giá trị xa 50 năm)
      const expiry = new Date(dob);
      expiry.setFullYear(birthYear + 100);
      return expiry;
    } else if (ageAtIssue >= 40) {
      targetMilestoneAge = 60;
    } else if (ageAtIssue >= 25) {
      targetMilestoneAge = 40;
    }

    const expiryDate = new Date(dob);
    expiryDate.setFullYear(birthYear + targetMilestoneAge);
    return expiryDate;
  }
}
