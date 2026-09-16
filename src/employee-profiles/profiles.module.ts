import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { User } from 'src/users/entities/users.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { AddressModule } from 'src/address/address.module';
import { Department } from 'src/departments/entities/department.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeeProfile, Department]),
    AddressModule,
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, TypeOrmModule],
})
export class ProfilesModule {}
