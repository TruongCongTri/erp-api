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
import { CitizenIdentityCard } from './entities/citizen-identity.entity';
import { CreateCitizenIdentityDto } from './dto/create-citizen-identity.dto';
import { UpdateCitizenIdentityDto } from './dto/update-citizen-identity.dto';

@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(User) // Injected to verify passwords without circular module dependency
    private readonly userRepository: Repository<User>,
    @InjectRepository(CitizenIdentityCard)
    private readonly cccdRepository: Repository<CitizenIdentityCard>,
  ) {}

  private async verifySecureAccess(
    targetUserId: string,
    requester: ActiveUserData,
    dto: SecureAccessDto,
  ): Promise<User> {
    const requesterRecord = await this.userRepository.findOne({
      where: { id: requester.id },
      select: {
        id: true,
        passwordHash: true,
      }, // Must explicitly select the hidden password field
    });

    if (!requesterRecord)
      throw new UnauthorizedException('Invalid credential confirmation.');

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      requesterRecord.passwordHash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credential confirmation.');

    // Enforce Self or HR
    const isSelf = requester.id === targetUserId;
    const isHR = requester.permissions.includes('hr:read:any');
    if (!isSelf && !isHR)
      throw new ForbiddenException(
        'You do not have permission to view this sensitive data.',
      );

    return requesterRecord;
  }

  async createCccd(
    userId: string,
    dto: CreateCitizenIdentityDto,
    adminUser: ActiveUserData,
  ): Promise<CitizenIdentityCard> {
    // 1. Fetch user to ensure they exist and have an Employee Profile
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: { identityCard: true } },
    });

    if (!user) throw new NotFoundException('User not found');
    if (!user.profile) {
      throw new BadRequestException(
        'Cannot add CCCD. User must have an Employee Profile first.',
      );
    }
    if (user.profile.identityCard) {
      throw new ConflictException(
        'User already has a CCCD. Please use the update endpoint.',
      );
    }

    // 2. Prevent duplicate CCCD Numbers across the entire database
    const existingCccd = await this.cccdRepository.findOneBy({
      cccdNumber: dto.cccdNumber,
    });
    if (existingCccd) {
      throw new ConflictException(
        `CCCD Number ${dto.cccdNumber} is already registered in the system.`,
      );
    }

    // 3. Create the CCCD entity with Audit Trails
    const newCccd = this.cccdRepository.create({
      ...dto,
      createdBy: adminUser.id,
      createdByName: adminUser.fullName,
      updatedBy: adminUser.id,
      updatedByName: adminUser.fullName,
    });

    // 4. Save the CCCD independently first
    const savedCccd = await this.cccdRepository.save(newCccd);

    // 5. Link it to the Profile and save the User (Cascades the update to the profile)
    user.profile.identityCard = savedCccd;
    user.profile.updatedBy = adminUser.id;
    user.profile.updatedByName = adminUser.fullName;
    await this.userRepository.save(user);

    return savedCccd;
  }

  async updateCccd(
    userId: string,
    dto: UpdateCitizenIdentityDto,
    adminUser: ActiveUserData,
  ): Promise<CitizenIdentityCard> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: { identityCard: true } },
    });

    if (!user || !user.profile?.identityCard) {
      throw new NotFoundException('CCCD data not found to update.');
    }

    // Check for CCCD Number collision if they are trying to change it
    if (
      dto.cccdNumber &&
      dto.cccdNumber !== user.profile.identityCard.cccdNumber
    ) {
      const existing = await this.cccdRepository.findOneBy({
        cccdNumber: dto.cccdNumber,
      });
      if (existing)
        throw new ConflictException(
          `CCCD Number ${dto.cccdNumber} is already registered.`,
        );
    }

    Object.assign(user.profile.identityCard, dto);

    // Audit Trail
    user.profile.identityCard.updatedBy = adminUser.id;
    user.profile.identityCard.updatedByName = adminUser.fullName;

    return this.cccdRepository.save(user.profile.identityCard);
  }

  async getCccdSecurely(
    targetUserId: string,
    requester: ActiveUserData,
    dto: SecureAccessDto,
  ) {
    await this.verifySecureAccess(targetUserId, requester, dto);

    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: { profile: { identityCard: true } },
    });

    if (!user || !user.profile?.identityCard)
      throw new NotFoundException('CCCD data not found');
    return user.profile.identityCard;
  }

  parseCccdQr(rawQrString: string) {
    try {
      const parts = rawQrString.split('|');
      if (parts.length < 7) throw new Error();
      return {
        cccdNumber: parts[0],
        oldId: parts[1],
        fullName: parts[2],
        dateOfBirth: `${parts[3].slice(4, 8)}-${parts[3].slice(2, 4)}-${parts[3].slice(0, 2)}`,
        gender: parts[4],
        placeOfResidence: parts[5],
        dateOfIssue: `${parts[6].slice(4, 8)}-${parts[6].slice(2, 4)}-${parts[6].slice(0, 2)}`,
      };
    } catch (_e) {
      throw new BadRequestException('Invalid CCCD QR Code format');
    }
  }
}
