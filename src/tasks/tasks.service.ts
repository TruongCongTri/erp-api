import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from 'src/users/entities/users.entity';
import { UserStatus } from 'src/users/enums/user-status.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  // Runs exactly at 00:00 (Midnight) every single day
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'cleanup_unverified_users',
    timeZone: 'Asia/Ho_Chi_Minh', // Aligns execution with local time
  })
  async cleanupUnverifiedUsers(): Promise<void> {
    this.logger.log('Running daily cleanup of unverified pending accounts...');

    // Calculate the exact timestamp for 24 hours ago
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() - 24);

    try {
      // Safely delete users who have been pending longer than 24 hours
      const result = await this.userRepository.delete({
        status: UserStatus.PENDING_VERIFICATION,
        createdAt: LessThan(expirationDate),
      });

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Successfully purged ${result.affected} abandoned account(s).`,
        );
      } else {
        this.logger.log('No abandoned accounts found. System is clean.');
      }
    } catch (error) {
      this.logger.error(
        'Failed to execute unverified user cleanup',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // =====================================
  // DYNAMIC CONTROL METHODS
  // =====================================

  getJobsStatus() {
    const jobs = this.schedulerRegistry.getCronJobs();
    const result: { name: string; isRunning: boolean; nextRun: string }[] = [];

    // Iterate through the Map of all registered cron jobs
    jobs.forEach((job, key) => {
      let nextRun = 'Paused';
      const isRunning =
        (job as unknown as { running?: boolean }).running === true;
      try {
        if (isRunning) nextRun = job.nextDate().toJSDate().toISOString();
      } catch (_e) {
        // If a job has already fired and has no next date, it throws an error
      }

      result.push({
        name: key,
        isRunning, // Boolean indicating if it's currently active
        nextRun,
      });
    });

    return result;
  }

  toggleJob(name: string, action: 'start' | 'stop') {
    try {
      const job = this.schedulerRegistry.getCronJob(name);

      if (action === 'start') {
        job.start();
        this.logger.log(`Job ${name} has been resumed.`);
      } else if (action === 'stop') {
        job.stop();
        this.logger.log(`Job ${name} has been paused.`);
      }

      const isRunning =
        (job as unknown as { running?: boolean }).running === true;

      return { name, isRunning };
    } catch (_e) {
      throw new NotFoundException(`Cron job ${name} not found.`);
    }
  }

  async triggerJobNow(name: string): Promise<void> {
    try {
      // Validate the job exists in the registry
      this.schedulerRegistry.getCronJob(name);
    } catch (_e) {
      throw new NotFoundException(`Cron job ${name} not found.`);
    }

    this.logger.log(`Manual trigger requested for job: ${name}`);

    // Map string names to the actual class methods
    switch (name) {
      case 'cleanup_unverified_users':
        await this.cleanupUnverifiedUsers();
        break;
      // Add future jobs here...
      default:
        throw new NotFoundException(`Trigger mapping for ${name} is missing.`);
    }
  }
}
