// src/resources/system-resources.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemResourcesService } from './system-resources.service';
import { SystemResourcesController } from './system-resources.controller';
import { SystemResource } from './entities/system-resource.entity';
import { Permission } from 'src/permissions/entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemResource, Permission])],
  controllers: [SystemResourcesController],
  providers: [SystemResourcesService], //
  exports: [SystemResourcesService], // Export so PermissionsModule can use it if needed
})
export class SystemResourcesModule {}
