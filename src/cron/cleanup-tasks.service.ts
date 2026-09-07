import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemResource } from 'src/resources/entities/system-resource.entity';
import { Notification } from 'src/notifications/entities/notification.entity';

@Injectable()
export class CleanupTasksService {
  private readonly logger = new Logger(CleanupTasksService.name);

  constructor(
    // ✅ ONLY inject repositories that are safe to hard-delete
    @InjectRepository(SystemResource)
    private readonly resourceRepo: Repository<SystemResource>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,

    // ❌ DO NOT inject UserRepository, ContractRepository, etc.
  ) {}

  // Runs automatically every night at 2:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleGlobalRecycleBinCleanup() {
    this.logger.log('🧹 Starting 30-day recycle bin cleanup...');

    // Calculate the exact date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Map your repositories with a friendly name for logging
    const targets = [
      { name: 'System Resources', repo: this.resourceRepo },
      { name: 'Notifications', repo: this.notificationRepo },
    ];

    for (const target of targets) {
      try {
        // TypeORM's query builder automatically knows which table to target based on the repo instance
        const result = await target.repo
          .createQueryBuilder()
          .delete()
          .where('deleted_at IS NOT NULL')
          .andWhere('deleted_at <= :date', { date: thirtyDaysAgo })
          .execute();

        if (result.affected && result.affected > 0) {
          this.logger.log(
            `✨ [${target.name}] Cleanup complete! Permanently deleted ${result.affected} old records.`,
          );
        }
      } catch (error) {
        // Keeping try/catch inside the loop ensures that if one table fails,
        // it doesn't prevent the other tables from being cleaned up!
        this.logger.error(
          `❌ Failed to empty recycle bin for [${target.name}]`,
          error,
        );
      }
    }
    this.logger.log('✅ Global recycle bin cleanup finished.');
  }
}
