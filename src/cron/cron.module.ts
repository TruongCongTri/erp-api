import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CleanupTasksService } from './cleanup-tasks.service';
import { SystemResource } from 'src/resources/entities/system-resource.entity';
import { Notification } from 'src/notifications/entities/notification.entity';

@Module({
  imports: [
    // ✅ Register all entities that the CleanupTasksService needs to access
    TypeOrmModule.forFeature([SystemResource, Notification]),
  ],
  providers: [CleanupTasksService],
})
export class CronModule {}
