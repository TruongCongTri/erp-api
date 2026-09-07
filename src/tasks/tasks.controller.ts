import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/common/guards/permissions.guard';
import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';

@Controller('admin/tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @RequirePermissions('system:read:any') // Example admin permission
  getJobsStatus() {
    const data = this.tasksService.getJobsStatus();
    return { data, message: 'Cron jobs status retrieved' };
  }

  @Patch(':name/status')
  @RequirePermissions('system:update:any')
  toggleJob(
    @Param('name') name: string,
    @Body('action') action: 'start' | 'stop',
  ) {
    const data = this.tasksService.toggleJob(name, action);
    return { data, message: `Job ${name} successfully ${action}ed` };
  }

  @Post(':name/trigger')
  @RequirePermissions('system:update:any')
  triggerJobNow(@Param('name') name: string) {
    // We don't await this because background jobs might take minutes to run.
    // We kick off the promise asynchronously and return an immediate 200 OK.
    this.tasksService.triggerJobNow(name).catch((err) => {
      // Unhandled errors during manual triggers will be caught here
      console.error(`Manual trigger of ${name} failed:`, err);
    });

    return { message: `Background execution started for ${name}` };
  }
}
