import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAvatar } from './entities/user-avatar.entity';
import { type ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { CacheClear } from 'src/common/cache/decorators/cache-clear.decorator';
import { CacheService } from 'src/common/cache/cache.service';
// import { UpdateUserAvatarDto } from './dto/update-user-avatar.dto';
import { User } from 'src/users/entities/users.entity';
import { S3StorageService } from 'src/ats/s3-storage.service';
import { Cacheable } from 'src/common/cache/decorators/cacheable.decorator';
import { extname } from 'path';

export interface UserAvatarResponse {
  id: string;
  imageUrl: string;
  isCurrent: boolean;
  createdAt: Date;
}

@Injectable()
export class UserAvatarsService {
  private readonly logger = new Logger(UserAvatarsService.name);

  constructor(
    @InjectRepository(UserAvatar)
    private readonly avatarRepository: Repository<UserAvatar>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3StorageService: S3StorageService,
    readonly cacheService: CacheService,
  ) {}

  /**
   * 1. Lấy danh sách tối đa 5 avatar của User (Được cache 24h)
   */
  @Cacheable({
    key: (userId: unknown) => `user:${userId as string}:avatars`,
    forceRefresh: (_userId: unknown, bypassCache: unknown) =>
      bypassCache === true,
    ttlSeconds: 86400,
  })
  async getUserAvatars(
    userId: string,
    _bypassCache?: boolean,
  ): Promise<UserAvatarResponse[]> {
    return this.avatarRepository.find({
      where: { user: { id: userId } },
      select: {
        id: true,
        imageUrl: true,
        isCurrent: true,
        createdAt: true,
      },
      order: {
        isCurrent: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  /**
   * 2. Upload avatar mới lên AWS S3 (Đường dẫn avatars/2026/...) & Giới hạn tối đa 5 ảnh
   */
  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
    requester: ActiveUserData,
  ): Promise<UserAvatar> {
    const userExists = await this.userRepository.exists({
      where: { id: userId },
    });
    if (!userExists) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    // 2.1. Tạo key theo định dạng avatars/2026/{userId}/{timestamp}_{cleanFileName}
    const currentYear = new Date().getFullYear();
    const timestamp = Date.now();
    const extension = extname(file.originalname).toLowerCase() || '.png';
    const baseName = file.originalname
      .replace(extension, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const s3Key = `avatars/${currentYear}/${userId}/${timestamp}_${baseName}${extension}`;

    // 2.2. Non-blocking I/O: Đẩy stream lên AWS S3
    const uploadResult = await this.s3StorageService.uploadStream(
      file.buffer,
      s3Key,
      file.mimetype,
    );

    // 2.3. Chuyển cờ isCurrent của avatar cũ về false
    await this.avatarRepository.update(
      { user: { id: userId }, isCurrent: true },
      {
        isCurrent: false,
        updatedBy: requester.id,
        updatedByName: requester.fullName,
      },
    );

    // 2.4. Lưu avatar mới vào bảng user_avatars
    const newAvatar = this.avatarRepository.create({
      imageUrl: uploadResult.fileUrl,
      s3Key: uploadResult.fileKey,
      isCurrent: true,
      user: { id: userId } as User,
      createdBy: requester.id,
      createdByName: requester.fullName,
      updatedBy: requester.id,
      updatedByName: requester.fullName,
    });
    const savedAvatar = await this.avatarRepository.save(newAvatar);

    // 2.5. Cập nhật trực tiếp users.avatar_url (Denormalization - O(1) reads)
    await this.userRepository.update(userId, {
      avatarUrl: uploadResult.fileUrl,
      updatedBy: requester.id,
      updatedByName: requester.fullName,
    });

    // 2.6. Kiểm tra giới hạn 5 avatar & Xóa ảnh cũ nhất khỏi S3 + Database
    await this.pruneOldAvatars(userId);

    return savedAvatar;
  }

  /**
   * 3. Chọn 1 trong các avatar đã có để đặt làm ảnh đại diện chính
   */
  @CacheClear({
    key: (userId: unknown) => [
      `user:${userId as string}*`,
      'users:available',
      'users:list:*',
    ],
    isPattern: true,
  })
  async selectAvatar(
    userId: string,
    avatarId: string,
    requester: ActiveUserData,
  ): Promise<UserAvatar> {
    const targetAvatar = await this.avatarRepository.findOne({
      where: { id: avatarId, user: { id: userId } },
      select: { id: true, imageUrl: true, isCurrent: true },
    });

    if (!targetAvatar) {
      throw new NotFoundException(
        'Ảnh đại diện không tồn tại trong danh sách của bạn.',
      );
    }

    if (targetAvatar.isCurrent) {
      return targetAvatar;
    }

    // Đổi cờ toàn bộ về false
    await this.avatarRepository.update(
      { user: { id: userId } },
      { isCurrent: false },
    );

    // Bật isCurrent cho ảnh được chọn
    targetAvatar.isCurrent = true;
    targetAvatar.updatedBy = requester.id;
    targetAvatar.updatedByName = requester.fullName;
    await this.avatarRepository.save(targetAvatar);

    // Cập nhật bảng User
    await this.userRepository.update(userId, {
      avatarUrl: targetAvatar.imageUrl,
      updatedBy: requester.id,
      updatedByName: requester.fullName,
    });

    return targetAvatar;
  }

  /**
   * Helper: Giữ tối đa 5 avatar, xóa các ảnh cũ hơn trên AWS S3 và CSDL
   */
  private async pruneOldAvatars(userId: string): Promise<void> {
    const avatars = await this.avatarRepository.find({
      where: { user: { id: userId } },
      select: { id: true, s3Key: true },
      order: { createdAt: 'DESC' }, // Ảnh mới nhất xếp đầu
    });

    if (avatars.length <= 5) {
      return;
    }

    // Lấy các ảnh từ vị trí thứ 6 trở đi
    const avatarsToDelete = avatars.slice(5);
    const idsToDelete = avatarsToDelete.map((a) => a.id);

    // 1. Xóa file khỏi AWS S3 (dùng allSettled để không chặn DB nếu có lỗi mạng S3)
    // 1. Dùng deleteFile có sẵn của S3StorageService xóa song song không chặn CSDL
    const s3DeleteTasks = avatarsToDelete
      .filter((a) => !!a.s3Key)
      .map((a) =>
        this.s3StorageService.deleteFile(a.s3Key).catch((err: unknown) => {
          this.logger.warn(
            `[S3 Purge Non-fatal] Lỗi xóa file S3 ${a.s3Key}: ${(err as Error).message}`,
          );
        }),
      );
    await Promise.allSettled(s3DeleteTasks);

    // 2. Xóa khỏi Database
    if (idsToDelete.length > 0) {
      await this.avatarRepository.delete(idsToDelete);
    }
  }
}
