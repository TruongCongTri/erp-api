import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import puppeteerExtra from 'puppeteer-extra';
// puppeteer-extra-plugin-stealth ships a plain CJS `module.exports = fn` with no
// `.default`, and this project's tsconfig doesn't set esModuleInterop, so a
// default import would compile to a broken `.default` access at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import type { Browser, Page, CookieParam } from 'puppeteer';
import { decryptSecret } from 'src/common/utils/crypto.util';
import { FacebookAccount } from './entities/facebook-account.entity';

puppeteerExtra.use(StealthPlugin());

const SCREENSHOT_DIR = join(process.cwd(), 'storage', 'automation-screenshots');

const CHECKPOINT_URL_MARKERS = [
  'checkpoint',
  'login_attempt',
  'captcha',
  'two_step_verification',
];

@Injectable()
export class BrowserManagerService {
  private readonly logger = new Logger(BrowserManagerService.name);

  /**
   * Launches a stealth-patched headless browser for the given account,
   * injecting its decrypted cookies and (optionally) its assigned proxy.
   */
  async launchAuthenticatedPage(
    account: FacebookAccount,
  ): Promise<{ browser: Browser; page: Page }> {
    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (account.proxyUrl) {
      launchArgs.push(`--proxy-server=${account.proxyUrl}`);
    }

    const browser = await puppeteerExtra.launch({
      headless: true,
      args: launchArgs,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    const cookies = this.decryptCookies(account.cookiesEncrypted);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }

    return { browser, page };
  }

  private decryptCookies(cookiesEncrypted: string): CookieParam[] {
    const raw = decryptSecret(cookiesEncrypted);
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CookieParam[]) : [];
  }

  /**
   * Heuristic detection of Facebook checkpoint/captcha interstitials by URL shape.
   * Real deployments should widen this with DOM selectors captured from live checkpoints.
   */
  isCheckpointUrl(currentUrl: string): boolean {
    const lower = currentUrl.toLowerCase();
    return CHECKPOINT_URL_MARKERS.some((marker) => lower.includes(marker));
  }

  async captureErrorScreenshot(page: Page, jobId: string): Promise<string> {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const fileName = `${jobId}-${Date.now()}.png`;
    const filePath = join(SCREENSHOT_DIR, fileName);
    await page.screenshot({
      path: filePath,
      fullPage: true,
    });
    this.logger.warn(`Đã chụp màn hình lỗi tại: ${filePath}`);
    return filePath;
  }

  async closeSafely(browser: Browser): Promise<void> {
    try {
      await browser.close();
    } catch (err) {
      this.logger.error('Lỗi khi đóng trình duyệt Puppeteer', err);
    }
  }
}
