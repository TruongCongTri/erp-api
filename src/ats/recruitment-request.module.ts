import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RecruitmentRequest } from './entities/recruitment-request.entity';
import { Department } from 'src/departments/entities/department.entity';
import { User } from 'src/users/entities/users.entity';

import { RecruitmentRequestController } from './recruitment-request.controller';
import { RecruitmentRequestService } from './recruitment-request.service';
import { CacheModule } from 'src/common/cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecruitmentRequest, Department, User]),
    CacheModule, // Cung cấp CacheService cho cơ chế Hot-Read & Invalidation
  ],
  controllers: [RecruitmentRequestController],
  providers: [RecruitmentRequestService],
  exports: [
    RecruitmentRequestService,
    TypeOrmModule, // Cho phép JobPostsModule tái sử dụng Repository mà không tạo connection mới
  ],
})
export class RecruitmentRequestModule {}
