import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RecruitmentRequest } from './entities/recruitment-request.entity';
import { Department } from 'src/departments/entities/department.entity';
import { User } from 'src/users/entities/users.entity';

import { RecruitmentRequestController } from './recruitment-request.controller';
import { RecruitmentRequestService } from './recruitment-request.service';

@Module({
  imports: [TypeOrmModule.forFeature([RecruitmentRequest, Department, User])],
  controllers: [RecruitmentRequestController],
  providers: [RecruitmentRequestService],
  exports: [
    RecruitmentRequestService,
    TypeOrmModule, // Export để JobPostsModule hoặc các module con khác truy cập Repository
  ],
})
export class RecruitmentRequestModule {}
