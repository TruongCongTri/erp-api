import {
  Module,
  Global,
  Logger,
  // Logger
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { CacheService } from './cache.service';

// local docker redis
// @Global() // Makes REDIS_CLIENT and CacheService available everywhere
// @Module({
//   imports: [ConfigModule],
//   providers: [
//     CacheService,
//     {
//       provide: 'REDIS_CLIENT',
//       useFactory: (configService: ConfigService) => {
//         const redisUrl =
//           configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

//         // ✅ Automatically detect if Upstash TLS is needed via URL scheme or explicit flag
//         const isTls =
//           configService.get<string>('REDIS_TLS') === 'true' ||
//           redisUrl.startsWith('rediss://');

//         const client = new Redis(redisUrl, {
//           // ✅ Upstash strictly requires this TLS configuration
//           tls: isTls ? { rejectUnauthorized: false } : undefined,

//           retryStrategy(times) {
//             return Math.min(times * 50, 3000);
//           },
//           maxRetriesPerRequest: 3,
//         });

//         // Cast err to Error to satisfy strict ESLint rules
//         client.on('error', (err) => console.warn('Redis error:', err.message));
//         return client;
//       },
//       inject: [ConfigService],
//     },
//   ],
//   exports: ['REDIS_CLIENT', CacheService],
// })
// export class CacheModule {}

// upstash redis
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    CacheService,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisClient');
        const redisUrl = configService.get<string>('REDIS_URL');
        const isTls =
          configService.get<string>('REDIS_TLS') === 'true' ||
          Boolean(redisUrl?.startsWith('rediss://'));

        const commonOptions: RedisOptions = {
          // Upstash requires TLS with SNI validation disabled if connecting directly
          tls: isTls ? { rejectUnauthorized: false } : undefined,
          retryStrategy: (times: number) => Math.min(times * 50, 3000),
          maxRetriesPerRequest: 3,
        };

        const client = redisUrl
          ? new Redis(redisUrl, commonOptions)
          : new Redis({
              ...commonOptions,
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
              password:
                configService.get<string>('REDIS_PASSWORD') || undefined,
            });

        client.on('error', (err: Error) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });

        client.on('connect', () => {
          logger.log('✅ Connected to Upstash Redis');
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT', CacheService],
})
export class CacheModule {}
