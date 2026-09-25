import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAvatarsController } from './user-avatars.controller';
import { UserAvatarsService } from './user-avatars.service';
import { User } from 'src/users/entities/users.entity';
import { UserAvatar } from './entities/user-avatar.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserAvatar])],
  controllers: [UserAvatarsController],
  providers: [UserAvatarsService],
  exports: [UserAvatarsService],
})
export class UserAvatarsModule {}
