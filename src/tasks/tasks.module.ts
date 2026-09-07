import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { User } from 'src/users/entities/users.entity';
import { TasksController } from './tasks.controller';

@Module({
  // Import the User entity so we can interact with the database
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
