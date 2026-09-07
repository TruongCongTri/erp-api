import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

@Global() // Makes REDIS_CLIENT and CacheService available everywhere
@Module({
  imports: [ConfigModule],
  providers: [
    CacheService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

        // ✅ Automatically detect if Upstash TLS is needed via URL scheme or explicit flag
        const isTls =
          configService.get<string>('REDIS_TLS') === 'true' ||
          redisUrl.startsWith('rediss://');

        const client = new Redis(redisUrl, {
          // ✅ Upstash strictly requires this TLS configuration
          tls: isTls ? { rejectUnauthorized: false } : undefined,

          retryStrategy(times) {
            return Math.min(times * 50, 3000);
          },
          maxRetriesPerRequest: 3,
        });

        // Cast err to Error to satisfy strict ESLint rules
        client.on('error', (err) => console.warn('Redis error:', err.message));
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT', CacheService],
})
export class CacheModule {}
