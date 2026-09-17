import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ManagedFacebookGroup } from './entities/managed-facebook-group.entity';
import { ScheduledAutomationJob } from './entities/scheduled-automation-job.entity';
import {
  FacebookAccountStatus,
  GroupMembershipStatus,
} from './enums/publishing-automation.enum';
import { GroupRecommendationQueryDto } from './dto/group-recommendation-query.dto';

export interface GroupRecommendationResult {
  group: ManagedFacebookGroup;
  isDirectMatch: boolean;
  keywordScore: number;
  totalScore: number;
}

const ACTIVE_JOB_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS'] as const;

@Injectable()
export class GroupSuitabilityService {
  constructor(
    @InjectRepository(ManagedFacebookGroup)
    private readonly groupRepo: Repository<ManagedFacebookGroup>,
    @InjectRepository(ScheduledAutomationJob)
    private readonly jobRepo: Repository<ScheduledAutomationJob>,
  ) {}

  async recommend(
    dto: GroupRecommendationQueryDto,
  ): Promise<GroupRecommendationResult[]> {
    const filterOnlyActiveMembers = dto.filterOnlyActiveMembers ?? true;

    const groups = await this.groupRepo.find({
      where: { isActive: true },
      relations: { assignedAccount: true },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todaysJobs = await this.jobRepo.find({
      where: {
        scheduledAt: Between(startOfDay, endOfDay),
        status: In([...ACTIVE_JOB_STATUSES]),
      },
    });
    const jobsPerGroup = this.countBy(todaysJobs, (job) => job.groupId ?? '');
    const jobsPerAccount = new Map<string, number>();
    for (const group of groups) {
      const count = jobsPerGroup.get(group.id) ?? 0;
      jobsPerAccount.set(
        group.assignedAccountId,
        (jobsPerAccount.get(group.assignedAccountId) ?? 0) + count,
      );
    }

    const now = Date.now();
    const candidates = groups.filter((group) => {
      if (filterOnlyActiveMembers) {
        if (group.membershipStatus !== GroupMembershipStatus.ACTIVE_MEMBER) {
          return false;
        }
      } else if (group.membershipStatus === GroupMembershipStatus.NOT_JOINED) {
        return false;
      }

      if (group.lastPostedAt) {
        const cooldownMs = group.cooldownMinutes * 60_000;
        if (now - new Date(group.lastPostedAt).getTime() < cooldownMs) {
          return false;
        }
      }

      if ((jobsPerGroup.get(group.id) ?? 0) >= group.dailyPostLimit) {
        return false;
      }

      const account = group.assignedAccount;
      if (!account) return false;
      if (
        account.status === FacebookAccountStatus.CHECKPOINT_BLOCKED ||
        !account.isActive
      ) {
        return false;
      }
      if ((jobsPerAccount.get(account.id) ?? 0) >= account.dailyPostLimit) {
        return false;
      }

      return true;
    });

    const searchTerms = this.normalizeTerms([
      ...dto.jobTitle.split(' '),
      ...dto.requiredSkills,
    ]);

    const scored: GroupRecommendationResult[] = candidates.map((group) => {
      const isDirectMatch = group.jobTypes.includes(dto.jobType);
      const keywordScore = this.computeKeywordOverlap(
        searchTerms,
        this.normalizeTerms(group.keywords),
      );
      const totalScore = (isDirectMatch ? 100 : 0) + keywordScore;
      return { group, isDirectMatch, keywordScore, totalScore };
    });

    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  private normalizeTerms(terms: string[]): string[] {
    return terms
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 0);
  }

  private computeKeywordOverlap(
    searchTerms: string[],
    groupKeywords: string[],
  ): number {
    const keywordSet = new Set(groupKeywords);
    return searchTerms.reduce(
      (score, term) => (keywordSet.has(term) ? score + 1 : score),
      0,
    );
  }

  private countBy<T>(
    items: T[],
    keyFn: (item: T) => string,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = keyFn(item);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }
}
