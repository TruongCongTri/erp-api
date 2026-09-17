import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Between, In, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import type { ActiveUserData } from 'src/common/decorators/current-user.decorator';
import { ManagedFacebookGroup } from './entities/managed-facebook-group.entity';
import { ScheduledAutomationJob } from './entities/scheduled-automation-job.entity';
import {
  AutomationPlatform,
  AutomationJobStatus,
} from './enums/publishing-automation.enum';
import { ScheduleGroupDistributionDto } from './dto/schedule-group-distribution.dto';
import { PUBLISHING_AUTOMATION_QUEUE } from './publishing-automation.constants';

const ACTIVE_JOB_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS'] as const;

@Injectable()
export class StaggeredScheduleService {
  constructor(
    @InjectRepository(ManagedFacebookGroup)
    private readonly groupRepo: Repository<ManagedFacebookGroup>,
    @InjectRepository(ScheduledAutomationJob)
    private readonly jobRepo: Repository<ScheduledAutomationJob>,
    @InjectQueue(PUBLISHING_AUTOMATION_QUEUE)
    private readonly publishingQueue: Queue,
  ) {}

  async distribute(
    dto: ScheduleGroupDistributionDto,
    user: ActiveUserData,
  ): Promise<ScheduledAutomationJob[]> {
    const minBufferMinutes = dto.minBufferMinutes ?? 25;
    const groupCount = dto.selectedGroupIds.length;

    const windowStart = this.toDate(dto.targetDate, dto.windowStartTime);
    const windowEnd = this.toDate(dto.targetDate, dto.windowEndTime);
    const windowDurationMinutes =
      (windowEnd.getTime() - windowStart.getTime()) / 60_000;

    if (windowDurationMinutes <= 0) {
      throw new BadRequestException('windowEndTime phải sau windowStartTime');
    }

    const requiredSpan = (groupCount - 1) * minBufferMinutes;
    if (requiredSpan > windowDurationMinutes) {
      throw new BadRequestException(
        `Khung giờ ${dto.windowStartTime}-${dto.windowEndTime} không đủ để giãn cách ${groupCount} bài đăng với khoảng cách tối thiểu ${minBufferMinutes} phút`,
      );
    }

    const groups = await this.groupRepo.find({
      where: { id: In(dto.selectedGroupIds) },
    });
    if (groups.length !== dto.selectedGroupIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều groupId không tồn tại trong hệ thống',
      );
    }

    await this.assertWithinDailyLimits(groups, dto.targetDate);

    const slots = this.generateCollisionFreeSlots(
      windowStart,
      windowDurationMinutes,
      groupCount,
      minBufferMinutes,
    );
    const shuffledGroups = this.shuffle([...groups]);

    const jobs = shuffledGroups.map((group, index) =>
      this.jobRepo.create({
        atsJobPostingId: dto.atsJobId,
        platform: AutomationPlatform.FACEBOOK_GROUP,
        targetDestination: group.groupUrl,
        groupId: group.id,
        jobTitle: dto.jobTitle,
        jobDescription: dto.jobDescription,
        scheduledAt: slots[index],
        status: AutomationJobStatus.PENDING,
        createdBy: user.id,
        createdByName: user.fullName,
      }),
    );

    const savedJobs = await this.jobRepo.save(jobs);

    await Promise.all(
      savedJobs.map((job) =>
        this.publishingQueue.add(
          'publish',
          { jobId: job.id },
          {
            jobId: job.id,
            delay: Math.max(0, job.scheduledAt.getTime() - Date.now()),
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
          },
        ),
      ),
    );

    return savedJobs;
  }

  private toDate(targetDate: string, time: string): Date {
    return new Date(`${targetDate}T${time}:00`);
  }

  private async assertWithinDailyLimits(
    groups: ManagedFacebookGroup[],
    targetDate: string,
  ): Promise<void> {
    const startOfDay = new Date(`${targetDate}T00:00:00`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999`);

    const existingJobs = await this.jobRepo.find({
      where: {
        groupId: In(groups.map((group) => group.id)),
        scheduledAt: Between(startOfDay, endOfDay),
        status: In([...ACTIVE_JOB_STATUSES]),
      },
    });

    const countByGroup = new Map<string, number>();
    for (const job of existingJobs) {
      const key = job.groupId ?? '';
      countByGroup.set(key, (countByGroup.get(key) ?? 0) + 1);
    }

    for (const group of groups) {
      const alreadyScheduled = countByGroup.get(group.id) ?? 0;
      if (alreadyScheduled >= group.dailyPostLimit) {
        throw new BadRequestException(
          `Nhóm "${group.name}" đã đạt giới hạn ${group.dailyPostLimit} bài đăng/ngày cho ngày ${targetDate}`,
        );
      }
    }
  }

  /**
   * Places `count` collision-free timestamps inside [windowStart, windowStart + durationMinutes]
   * such that any two are at least `minBufferMinutes` apart, using a randomized-but-uniform
   * placement: draw `count` uniform points in the reduced span, sort them, then re-inflate by
   * the cumulative buffer so ordering is preserved and gaps are guaranteed.
   */
  private generateCollisionFreeSlots(
    windowStart: Date,
    durationMinutes: number,
    count: number,
    minBufferMinutes: number,
  ): Date[] {
    if (count === 1) {
      const offset = Math.random() * durationMinutes;
      return [new Date(windowStart.getTime() + offset * 60_000)];
    }

    const reducedSpan = durationMinutes - (count - 1) * minBufferMinutes;
    const rawOffsets = Array.from(
      { length: count },
      () => Math.random() * reducedSpan,
    ).sort((a, b) => a - b);

    return rawOffsets.map((offset, index) => {
      const minutesFromStart = offset + index * minBufferMinutes;
      return new Date(windowStart.getTime() + minutesFromStart * 60_000);
    });
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
