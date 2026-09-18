import { Logger } from '@nestjs/common';

/**
 * Gemini (AI Studio) API key pool với cơ chế xoay vòng & cách ly key lỗi.
 *
 * Chiến lược tối đa hóa quota:
 * - Chọn key "rảnh" nhất: ít request đang chạy nhất, hòa thì chọn key lâu chưa dùng nhất (LRU)
 *   → tải được trải đều trên toàn bộ key thay vì dồn vào key #1.
 * - Quota của Gemini tính theo (project, model) nên cooldown được theo dõi riêng cho từng
 *   cặp (key, model): key bị 429 trên model chính vẫn dùng được cho model dự phòng.
 * - 429 theo phút  → cooldown theo `retryDelay` Google trả về (hoặc backoff lũy thừa theo key).
 * - 429 theo ngày  → cooldown tới nửa đêm giờ Pacific (thời điểm Google reset quota ngày).
 * - 401/403/key không hợp lệ/bị treo → vô hiệu hóa key (mọi model) trong thời gian dài.
 *
 * LƯU Ý: Các key phải thuộc các Google Cloud project KHÁC NHAU. Nhiều key trong cùng một
 * project dùng chung một quota nên xoay vòng sẽ không tăng thêm được lưu lượng.
 */

export type KeyFailureOutcome =
  /** Lỗi gắn với key (quota/quyền) → thử ngay key khác, không cần chờ */
  | 'rotate'
  /** Lỗi không phụ thuộc key (quá tải model, lỗi mạng, request sai) → để retry loop xử lý */
  | 'not-key-related';

export interface KeyLease<TClient> {
  readonly keyId: string;
  readonly client: TClient;
}

export interface KeyPoolStatus {
  keyId: string;
  inFlight: number;
  disabledUntil: string | null;
  modelCooldowns: Record<string, string>;
  stats: { success: number; rateLimited: number; authFailed: number };
}

interface KeyState<TClient> {
  keyId: string;
  client: TClient;
  inFlight: number;
  lastUsedAt: number;
  disabledUntil: number;
  /** model → epoch ms tới khi được dùng lại */
  cooldownUntil: Map<string, number>;
  /** model → số lần 429 liên tiếp (để tính backoff khi Google không trả retryDelay) */
  consecutiveRateLimits: Map<string, number>;
  stats: { success: number; rateLimited: number; authFailed: number };
}

const BASE_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
const AUTH_FAILURE_DISABLE_MS = 6 * 60 * 60_000;
const SUMMARY_EVERY_N_CALLS = 10;

export class GeminiKeyPool<TClient> {
  private readonly logger = new Logger(GeminiKeyPool.name);
  private readonly keys: KeyState<TClient>[];
  private totalCalls = 0;

  constructor(apiKeys: string[], createClient: (apiKey: string) => TClient) {
    this.keys = apiKeys.map((apiKey, index) => ({
      keyId: `key#${index + 1}(…${apiKey.slice(-4)})`,
      client: createClient(apiKey),
      inFlight: 0,
      lastUsedAt: 0,
      disabledUntil: 0,
      cooldownUntil: new Map(),
      consecutiveRateLimits: new Map(),
      stats: { success: 0, rateLimited: 0, authFailed: 0 },
    }));
    this.logger.log(
      `[Gemini KeyPool] Đã nạp ${this.keys.length} key: ${this.keys.map((k) => k.keyId).join(', ') || '(trống)'}`,
    );
  }

  get size(): number {
    return this.keys.length;
  }

  /** Lấy key khả dụng tốt nhất cho model; `undefined` nếu mọi key đang bị cooldown. */
  acquire(model: string): KeyLease<TClient> | undefined {
    const now = Date.now();
    const available = this.keys.filter((k) => this.isAvailable(k, model, now));
    if (available.length === 0) return undefined;

    const minInFlight = Math.min(...available.map((k) => k.inFlight));
    const leastBusy = available.filter((k) => k.inFlight === minInFlight);
    const oldestUse = Math.min(...leastBusy.map((k) => k.lastUsedAt));
    const candidates = leastBusy.filter((k) => k.lastUsedAt === oldestUse);
    // Random khi hòa để nhiều instance khởi động cùng lúc không cùng dồn vào key #1
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    chosen.inFlight++;
    chosen.lastUsedAt = now;
    return { keyId: chosen.keyId, client: chosen.client };
  }

  reportSuccess(lease: KeyLease<TClient>, model: string): void {
    const key = this.release(lease);
    if (!key) return;
    key.stats.success++;
    key.consecutiveRateLimits.delete(model);

    this.totalCalls++;
    if (this.totalCalls % SUMMARY_EVERY_N_CALLS === 0) this.logSummary();
  }

  /** In bảng tổng hợp mức sử dụng từng key — để kiểm tra tải có được chia đều không. */
  logSummary(): void {
    const now = Date.now();
    const lines = this.keys.map((k) => {
      const cooldowns = [...k.cooldownUntil.entries()]
        .filter(([, until]) => until > now)
        .map(([m, until]) => `${m}:${Math.ceil((until - now) / 1000)}s`);
      const state =
        k.disabledUntil > now
          ? `VÔ HIỆU ${Math.ceil((k.disabledUntil - now) / 60_000)}p`
          : cooldowns.length
            ? `cooldown ${cooldowns.join(' ')}`
            : 'OK';
      return `  ${k.keyId}: ok=${k.stats.success} 429=${k.stats.rateLimited} auth=${k.stats.authFailed} inFlight=${k.inFlight} [${state}]`;
    });
    this.logger.log(
      `[Gemini KeyPool] Tổng hợp (${this.totalCalls} lượt gọi thành công):\n${lines.join('\n')}`,
    );
  }

  reportFailure(
    lease: KeyLease<TClient>,
    model: string,
    statusCode: number | undefined,
    message: string,
  ): KeyFailureOutcome {
    const key = this.release(lease);
    if (!key) return 'not-key-related';
    const now = Date.now();

    if (this.isAuthFailure(statusCode, message)) {
      key.stats.authFailed++;
      key.disabledUntil = now + AUTH_FAILURE_DISABLE_MS;
      this.logger.error(
        `[Gemini KeyPool] ${key.keyId} bị từ chối (HTTP ${statusCode ?? '?'}) — vô hiệu hóa ${AUTH_FAILURE_DISABLE_MS / 3_600_000}h. Kiểm tra key trên AI Studio. ${message.slice(0, 200)}`,
      );
      this.logSummary();
      return 'rotate';
    }

    if (statusCode === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
      key.stats.rateLimited++;
      const streak = (key.consecutiveRateLimits.get(model) ?? 0) + 1;
      key.consecutiveRateLimits.set(model, streak);

      const cooldownMs = /PerDay/i.test(message)
        ? msUntilNextPacificMidnight(now)
        : (parseRetryDelayMs(message) ??
          Math.min(
            BASE_RATE_LIMIT_COOLDOWN_MS * 2 ** (streak - 1),
            MAX_RATE_LIMIT_COOLDOWN_MS,
          ));

      key.cooldownUntil.set(model, now + cooldownMs);
      this.logger.warn(
        `[Gemini KeyPool] ${key.keyId} hết quota trên ${model} — cooldown ${Math.round(cooldownMs / 1000)}s. Còn ${this.availableCount(model)}/${this.size} key khả dụng.`,
      );
      this.logSummary();
      return 'rotate';
    }

    return 'not-key-related';
  }

  /** Số ms tới khi có ít nhất một key dùng được cho model (0 nếu đang có sẵn). */
  msUntilNextAvailable(model: string): number {
    const now = Date.now();
    const readyAt = this.keys.map((k) =>
      Math.max(k.disabledUntil, k.cooldownUntil.get(model) ?? 0),
    );
    return Math.max(0, Math.min(...readyAt) - now);
  }

  availableCount(model: string): number {
    const now = Date.now();
    return this.keys.filter((k) => this.isAvailable(k, model, now)).length;
  }

  getStatus(): KeyPoolStatus[] {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    return this.keys.map((k) => ({
      keyId: k.keyId,
      inFlight: k.inFlight,
      disabledUntil: k.disabledUntil > now ? iso(k.disabledUntil) : null,
      modelCooldowns: Object.fromEntries(
        [...k.cooldownUntil.entries()]
          .filter(([, until]) => until > now)
          .map(([model, until]) => [model, iso(until)]),
      ),
      stats: { ...k.stats },
    }));
  }

  private isAvailable(key: KeyState<TClient>, model: string, now: number) {
    return (
      now >= key.disabledUntil && now >= (key.cooldownUntil.get(model) ?? 0)
    );
  }

  private release(lease: KeyLease<TClient>): KeyState<TClient> | undefined {
    const key = this.keys.find((k) => k.keyId === lease.keyId);
    if (key && key.inFlight > 0) key.inFlight--;
    return key;
  }

  private isAuthFailure(statusCode: number | undefined, message: string) {
    if (statusCode === 401 || statusCode === 403) return true;
    return /API_KEY_INVALID|API key not valid|API key expired|CONSUMER_SUSPENDED|has been suspended|PERMISSION_DENIED/i.test(
      message,
    );
  }
}

/** Đọc `retryDelay` ("37s" / "1.5s") từ body lỗi 429 của Gemini. */
function parseRetryDelayMs(message: string): number | undefined {
  const match = /"?retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(message);
  if (!match) return undefined;
  // +1s đệm để tránh gọi lại đúng mép cửa sổ quota
  return Math.ceil(parseFloat(match[1]) * 1000) + 1000;
}

/** Quota ngày của Gemini reset lúc 00:00 giờ Pacific (America/Los_Angeles). */
function msUntilNextPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsedMs =
    (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return Math.max(60_000, 24 * 3_600_000 - elapsedMs + 60_000);
}

/**
 * Đọc danh sách key từ env. Hỗ trợ đồng thời:
 * - GEMINI_API_KEYS="k1,k2,k3"   (phân tách bằng dấu phẩy/xuống dòng)
 * - GEMINI_API_KEY_1 … GEMINI_API_KEY_20
 * - GEMINI_API_KEY               (tương thích ngược)
 */
export function collectGeminiApiKeys(
  read: (name: string) => string | undefined,
): string[] {
  const raw: string[] = [];
  const list = read('GEMINI_API_KEYS');
  if (list) raw.push(...list.split(/[,\s]+/));
  for (let i = 1; i <= 20; i++) {
    const value = read(`GEMINI_API_KEY_${i}`);
    if (value) raw.push(value);
  }
  const single = read('GEMINI_API_KEY');
  if (single) raw.push(single);

  return [...new Set(raw.map((k) => k.trim()).filter(Boolean))];
}
