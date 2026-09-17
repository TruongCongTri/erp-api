import { Injectable, Logger } from '@nestjs/common';
import { BrowserManagerService } from '../browser-manager.service';
import {
  IPublisherStrategy,
  PublishJobContext,
  PublishResult,
} from '../interfaces/publisher-strategy.interface';

/**
 * Scaffolded TopCV recruiter-portal publisher.
 *
 * TODO: capture real selectors from a live TopCV Enterprise recruiter session
 * (login form, job-posting composer, submit/confirm buttons, success toast/link)
 * before enabling this strategy in production. The shape below mirrors
 * FacebookGroupPublisherStrategy so the BullMQ processor and factory can treat
 * every platform uniformly.
 */
@Injectable()
export class TopCvPublisherStrategy implements IPublisherStrategy {
  private readonly logger = new Logger(TopCvPublisherStrategy.name);

  constructor(private readonly browserManager: BrowserManagerService) {}

  publish(context: PublishJobContext): Promise<PublishResult> {
    const { targetDestination } = context;
    this.logger.warn(
      `[TopCV] Strategy chưa được cấu hình selector thực tế cho ${targetDestination} - bỏ qua.`,
    );

    return Promise.resolve({
      success: false,
      errorMessage:
        'TopCvPublisherStrategy chưa triển khai - cần selector DOM thực tế từ phiên đăng nhập TopCV',
    });
  }
}
