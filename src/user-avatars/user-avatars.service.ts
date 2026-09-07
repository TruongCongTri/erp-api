import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAvatar } from './entities/user-avatar.entity';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { CacheService } from 'src/common/cache/cache.service';
import { UpdateUserAvatarDto } from './dto/update-user-avatar.dto';

@Injectable()
export class UserAvatarsService {
  constructor(
    @InjectRepository(UserAvatar)
    private readonly avatarRepository: Repository<UserAvatar>,
    readonly cacheService: CacheService,
  ) {}

  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async updateAvatar(
    userId: string,
    dto: UpdateUserAvatarDto,
    requester: ActiveUserData,
  ) {
    const { imageUrl } = dto;

    // Demote current
    await this.avatarRepository.update(
      { user: { id: userId }, isCurrent: true },
      {
        isCurrent: false,
        updatedBy: requester.id,
        updatedByName: requester.fullName,
      },
    );

    // Create new
    const newAvatar = this.avatarRepository.create({
      imageUrl,
      isCurrent: true,
      user: { id: userId },
      createdBy: requester.id,
      createdByName: requester.fullName,
    });
    await this.avatarRepository.save(newAvatar);

    // Enforce Max 5
    const allAvatars = await this.avatarRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'ASC' },
    });
    if (allAvatars.length > 5) {
      const avatarsToDelete = allAvatars.slice(0, allAvatars.length - 5);
      await this.avatarRepository.remove(avatarsToDelete); // Hard delete to save space
    }
    return newAvatar;
  }
}
