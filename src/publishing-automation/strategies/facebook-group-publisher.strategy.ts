import { Injectable, Logger } from '@nestjs/common';
import { BrowserManagerService } from '../browser-manager.service';
import {
  IPublisherStrategy,
  PublishJobContext,
  PublishResult,
} from '../interfaces/publisher-strategy.interface';

// Facebook's DOM markup changes frequently and varies by locale/rollout cohort.
// These selectors are best-effort and should be re-captured from a live session
// if Facebook ships a redesign of the group composer.
const COMPOSER_TRIGGER_SELECTOR = '[aria-label*="Write something"]';
const COMPOSER_TEXTAREA_SELECTOR =
  'div[contenteditable="true"][role="textbox"]';
const SUBMIT_BUTTON_SELECTOR = '[aria-label="Post"]';
const POST_LINK_SELECTOR = 'a[href*="/posts/"], a[href*="/permalink/"]';

const NAVIGATION_TIMEOUT_MS = 45_000;
const COMPOSER_TIMEOUT_MS = 15_000;

@Injectable()
export class FacebookGroupPublisherStrategy implements IPublisherStrategy {
  private readonly logger = new Logger(FacebookGroupPublisherStrategy.name);

  constructor(private readonly browserManager: BrowserManagerService) {}

  async publish(context: PublishJobContext): Promise<PublishResult> {
    const { job, account, targetDestination, jobTitle, jobDescription } =
      context;

    if (!account) {
      return {
        success: false,
        errorMessage: 'Không tìm thấy tài khoản Facebook được gán cho nhóm này',
      };
    }

    const { browser, page } =
      await this.browserManager.launchAuthenticatedPage(account);

    try {
      await page.goto(targetDestination, {
        waitUntil: 'networkidle2',
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      if (this.browserManager.isCheckpointUrl(page.url())) {
        const screenshotPath = await this.browserManager.captureErrorScreenshot(
          page,
          job.id,
        );
        this.logger.warn(
          `[Facebook] Tài khoản ${account.accountName} bị chặn checkpoint khi truy cập nhóm`,
        );
        return {
          success: false,
          checkpointBlocked: true,
          screenshotPath,
          errorMessage:
            'Tài khoản Facebook bị yêu cầu xác minh checkpoint/captcha',
        };
      }

      await page.waitForSelector(COMPOSER_TRIGGER_SELECTOR, {
        timeout: COMPOSER_TIMEOUT_MS,
      });
      await page.click(COMPOSER_TRIGGER_SELECTOR);

      await page.waitForSelector(COMPOSER_TEXTAREA_SELECTOR, {
        timeout: COMPOSER_TIMEOUT_MS,
      });
      const postBody = `${jobTitle}\n\n${jobDescription}`;
      await page.type(COMPOSER_TEXTAREA_SELECTOR, postBody, { delay: 15 });

      await page.waitForSelector(SUBMIT_BUTTON_SELECTOR, {
        timeout: COMPOSER_TIMEOUT_MS,
      });
      await page.click(SUBMIT_BUTTON_SELECTOR);

      // Give the feed time to render the newly created post before scraping its link.
      await page.waitForSelector(POST_LINK_SELECTOR, {
        timeout: COMPOSER_TIMEOUT_MS,
      });
      const publishedPostUrl = await page.$eval(
        POST_LINK_SELECTOR,
        (el) => el.href,
      );

      this.logger.log(
        `[Facebook] Đăng bài thành công vào nhóm qua tài khoản ${account.accountName}`,
      );

      return { success: true, publishedPostUrl };
    } catch (err) {
      const screenshotPath = await this.browserManager
        .captureErrorScreenshot(page, job.id)
        .catch(() => undefined);
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[Facebook] Lỗi khi đăng bài vào nhóm: ${errorMessage}`,
      );
      return { success: false, screenshotPath, errorMessage };
    } finally {
      await this.browserManager.closeSafely(browser);
    }
  }
}
