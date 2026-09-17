import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { encryptSecret } from 'src/common/utils/crypto.util';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { FacebookAccount } from './entities/facebook-account.entity';
import { FacebookAccountStatus } from './enums/publishing-automation.enum';
import { CreateFacebookAccountDto } from './dto/create-facebook-account.dto';
import { UpdateFacebookAccountStatusDto } from './dto/update-facebook-account-status.dto';

type SafeFacebookAccount = Omit<FacebookAccount, 'cookiesEncrypted'>;

@Injectable()
export class FacebookAccountsService {
  constructor(
    @InjectRepository(FacebookAccount)
    private readonly accountRepo: Repository<FacebookAccount>,
  ) {}

  // Cookies are write-only secrets: never surface `cookiesEncrypted` back through the API.
  private sanitize(account: FacebookAccount): SafeFacebookAccount {
    const { cookiesEncrypted: _cookiesEncrypted, ...safe } = account;
    return safe;
  }

  async create(
    dto: CreateFacebookAccountDto,
    user: ActiveUserData,
  ): Promise<SafeFacebookAccount> {
    const existing = await this.accountRepo.findOne({
      where: { accountIdentifier: dto.accountIdentifier },
    });
    if (existing) {
      throw new ConflictException(
        'Tài khoản Facebook với accountIdentifier này đã tồn tại',
      );
    }

    const account = this.accountRepo.create({
      accountName: dto.accountName,
      accountIdentifier: dto.accountIdentifier,
      cookiesEncrypted: encryptSecret(JSON.stringify(dto.cookies)),
      proxyUrl: dto.proxyUrl ?? null,
      dailyPostLimit: dto.dailyPostLimit ?? 5,
      status: FacebookAccountStatus.HEALTHY,
      createdBy: user.id,
      createdByName: user.fullName,
    });

    const saved = await this.accountRepo.save(account);
    return this.sanitize(saved);
  }

  async findAll(): Promise<SafeFacebookAccount[]> {
    const accounts = await this.accountRepo.find({
      order: { createdAt: 'DESC' },
    });
    return accounts.map((account) => this.sanitize(account));
  }

  async findHealthyById(id: string): Promise<FacebookAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Facebook');
    }
    if (account.status !== FacebookAccountStatus.HEALTHY || !account.isActive) {
      throw new ConflictException(
        'Tài khoản Facebook không ở trạng thái HEALTHY/hoạt động',
      );
    }
    return account;
  }

  async updateStatus(
    id: string,
    dto: UpdateFacebookAccountStatusDto,
    user: ActiveUserData,
  ): Promise<SafeFacebookAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản Facebook');
    }

    if (dto.status !== undefined) account.status = dto.status;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    account.updatedBy = user.id;
    account.updatedByName = user.fullName;

    const saved = await this.accountRepo.save(account);
    return this.sanitize(saved);
  }
}
