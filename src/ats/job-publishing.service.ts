import { Injectable, Logger } from '@nestjs/common';
import { JobPost } from './entities/job-post.entity';
import { PlatformSource } from './enums/ats.enum';

@Injectable()
export class JobPublishingService {
  private readonly logger = new Logger(JobPublishingService.name);

  // Dispatch đa nền tảng và trả về External Mapping IDs
  async dispatchToPlatforms(jobPost: JobPost): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};

    for (const platform of jobPost.targetPlatforms) {
      try {
        switch (platform) {
          case PlatformSource.COMPANY_WEBSITE:
            mapping[PlatformSource.COMPANY_WEBSITE] =
              `web_${jobPost.id.substring(0, 8)}`;
            break;

          case PlatformSource.LINKEDIN:
            // Giả lập gọi LinkedIn Jobs Recruiter API
            mapping[PlatformSource.LINKEDIN] = `ln_job_${Date.now()}`;
            this.logger.log(`[LinkedIn] Đã đăng bài: ${jobPost.publicTitle}`);
            break;

          case PlatformSource.TOPCV:
            // Giả lập webhook đẩy TopCV Enterprise API
            mapping[PlatformSource.TOPCV] = `topcv_${Date.now()}`;
            this.logger.log(
              `[TopCV] Đã đẩy chiến dịch: ${jobPost.publicTitle}`,
            );
            break;

          case PlatformSource.VIETNAMWORKS:
            mapping[PlatformSource.VIETNAMWORKS] = `vnw_${Date.now()}`;
            break;

          case PlatformSource.FACEBOOK:
            mapping[PlatformSource.FACEBOOK] = `fb_post_${Date.now()}`;
            break;

          default:
            break;
        }
      } catch (err) {
        this.logger.error(`Lỗi phân phối nền tảng ${platform}`, err);
      }
    }

    return Promise.resolve(mapping);
  }

  // Thu hồi bài đăng đa nền tảng khi đóng Job
  async unlistFromPlatforms(jobPost: JobPost): Promise<void> {
    const externalMapping = jobPost.externalMapping || {};
    for (const [platform, externalId] of Object.entries(externalMapping)) {
      this.logger.log(
        `[Unlist] Thu hồi tin đăng trên ${platform} (ID: ${externalId})`,
      );
    }

    return Promise.resolve();
  }
}
