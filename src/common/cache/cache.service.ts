import { Injectable, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Injectable()
export class CacheService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  // 1. Get with strict typing
  async get<T>(key: string): Promise<T | null> {
    const data = await this.redisClient.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  // 2. Set with optional TTL (Time To Live) in seconds
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.redisClient.setex(key, ttlSeconds, data);
    } else {
      await this.redisClient.set(key, data);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  // 3. Delete exact keys
  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }

  // 4. Enterprise-safe pattern deletion using SCAN (Does not block Redis thread)
  async delPattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100, // Process in batches of 100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } while (cursor !== '0');
  }

  // 5. THE MAGIC WRAPPER: Fetch from cache, or execute DB call and cache it
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds = 3600,
    forceRefresh = false,
  ): Promise<T> {
    // Skip the cache check if forceRefresh is true
    if (!forceRefresh) {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
    }

    // Cache miss -> execute the database query
    const freshData = await fetcher();

    // Cache the result for next time
    await this.set(key, freshData, ttlSeconds);

    return freshData;
  }
}
