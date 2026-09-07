import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { User } from 'src/users/entities/users.entity';
import { CitizenIdentityCard } from './entities/citizen-identity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, CitizenIdentityCard])],
  controllers: [IdentityController],
  providers: [IdentityService],
})
export class IdentityModule {}
