import { Injectable } from '@nestjs/common';
import { AutomationPlatform } from '../enums/publishing-automation.enum';
import { IPublisherStrategy } from '../interfaces/publisher-strategy.interface';
import { FacebookGroupPublisherStrategy } from './facebook-group-publisher.strategy';
import { TopCvPublisherStrategy } from './topcv-publisher.strategy';
import { CareerVietPublisherStrategy } from './careerviet-publisher.strategy';

@Injectable()
export class PublisherStrategyFactory {
  constructor(
    private readonly facebookGroupStrategy: FacebookGroupPublisherStrategy,
    private readonly topCvStrategy: TopCvPublisherStrategy,
    private readonly careerVietStrategy: CareerVietPublisherStrategy,
  ) {}

  resolve(platform: AutomationPlatform): IPublisherStrategy {
    switch (platform) {
      case AutomationPlatform.FACEBOOK_GROUP:
        return this.facebookGroupStrategy;
      case AutomationPlatform.TOPCV:
        return this.topCvStrategy;
      case AutomationPlatform.CAREERVIET:
        return this.careerVietStrategy;
      default:
        throw new Error(
          `Không hỗ trợ nền tảng đăng bài: ${platform as string}`,
        );
    }
  }
}
