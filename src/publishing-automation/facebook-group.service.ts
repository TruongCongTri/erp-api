import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { ManagedFacebookGroup } from './entities/managed-facebook-group.entity';
import { FacebookAccountsService } from './facebook-accounts.service';
import { CreateFacebookGroupDto } from './dto/create-facebook-group.dto';
import { BulkImportFacebookGroupsDto } from './dto/bulk-import-facebook-groups.dto';
import { UpdateGroupMembershipDto } from './dto/update-group-membership.dto';
import { Logger } from '@nestjs/common';

@Injectable()
export class FacebookGroupService {
  private readonly logger = new Logger(FacebookGroupService.name);

  constructor(
    @InjectRepository(ManagedFacebookGroup)
    private readonly groupRepo: Repository<ManagedFacebookGroup>,
    private readonly accountsService: FacebookAccountsService,
  ) {}

  async create(
    dto: CreateFacebookGroupDto,
    user: ActiveUserData,
  ): Promise<ManagedFacebookGroup> {
    const existing = await this.groupRepo.findOne({
      where: { groupUrl: dto.groupUrl },
    });
    if (existing) {
      throw new ConflictException(
        'groupUrl này đã được quản lý trong hệ thống',
      );
    }
    this.logger.log(`[Local] Thêm group mới`);
    // Ensures the account exists and is HEALTHY/active before a group can be assigned to it.
    await this.accountsService.findHealthyById(dto.assignedAccountId);

    const group = this.groupRepo.create({
      name: dto.name,
      groupUrl: dto.groupUrl,
      jobTypes: dto.jobTypes,
      keywords: dto.keywords,
      assignedAccountId: dto.assignedAccountId,
      membershipStatus: dto.membershipStatus,
      dailyPostLimit: dto.dailyPostLimit ?? 2,
      cooldownMinutes: dto.cooldownMinutes ?? 60,
      createdBy: user.id,
      createdByName: user.fullName,
    });

    return this.groupRepo.save(group);
  }

  async bulkImport(
    dto: BulkImportFacebookGroupsDto,
    user: ActiveUserData,
  ): Promise<{ imported: ManagedFacebookGroup[]; skipped: string[] }> {
    const imported: ManagedFacebookGroup[] = [];
    const skipped: string[] = [];

    for (const groupDto of dto.groups) {
      try {
        const created = await this.create(groupDto, user);
        imported.push(created);
      } catch {
        skipped.push(groupDto.groupUrl);
      }
    }

    return { imported, skipped };
  }

  async findAll(): Promise<ManagedFacebookGroup[]> {
    return this.groupRepo.find({ order: { createdAt: 'DESC' } });
  }

  async updateMembership(
    id: string,
    dto: UpdateGroupMembershipDto,
    user: ActiveUserData,
  ): Promise<ManagedFacebookGroup> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) {
      throw new NotFoundException('Không tìm thấy nhóm Facebook');
    }

    group.membershipStatus = dto.membershipStatus;
    group.updatedBy = user.id;
    group.updatedByName = user.fullName;

    return this.groupRepo.save(group);
  }
}
