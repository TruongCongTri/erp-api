import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { User } from 'src/users/entities/users.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { AddressModule } from 'src/address/address.module';
import { Department } from 'src/departments/entities/department.entity';
import { EmployeeFinancial } from './entities/employee-financial.entity';
import { EmployeeSalaryHistory } from './entities/employee-salary-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      EmployeeProfile,
      EmployeeFinancial,
      EmployeeSalaryHistory,
      Department,
    ]),
    AddressModule,
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService, TypeOrmModule],
})
export class ProfilesModule {}
