import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { User } from 'src/users/entities/users.entity';
import { CitizenIdentityCard } from './entities/citizen-identity.entity';
import { EmployeeProfile } from 'src/employee-profiles/entities/employee-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmployeeProfile, CitizenIdentityCard]),
  ],
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService, TypeOrmModule],
})
export class IdentityModule {}
