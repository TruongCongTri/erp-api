import { ScheduledAutomationJob } from '../entities/scheduled-automation-job.entity';
import { ManagedFacebookGroup } from '../entities/managed-facebook-group.entity';
import { FacebookAccount } from '../entities/facebook-account.entity';

export interface PublishJobContext {
  job: ScheduledAutomationJob;
  jobTitle: string;
  jobDescription: string;
  targetDestination: string;
  group?: ManagedFacebookGroup | null;
  account?: FacebookAccount | null;
}

export interface PublishResult {
  success: boolean;
  publishedPostUrl?: string;
  checkpointBlocked?: boolean;
  screenshotPath?: string;
  errorMessage?: string;
}

export interface IPublisherStrategy {
  publish(context: PublishJobContext): Promise<PublishResult>;
}
