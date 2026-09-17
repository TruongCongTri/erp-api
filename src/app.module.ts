// src/app.module.ts
import type { Redis } from 'ioredis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { typeOrmConfigFactory } from './config/typeorm.config';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'; // ✅ Import the new global filter
import { CacheModule } from './common/cache/cache.module';

// Feature Modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { SystemResourcesModule } from './resources/system-resources.module';
import { validateEnv } from './config/env.validation';
import { CronModule } from './cron/cron.module';
import { ProfilesModule } from './employee-profiles/profiles.module';
import { IdentityModule } from './identity/identity.module';
import { UserAvatarsModule } from './user-avatars/user-avatars.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { DepartmentsModule } from './departments/departments.module';
import { TicketModule } from './tickets/ticket.module';
import { AtsModule } from './ats/ats.module';
import { StorageModule } from './ats/storage.module';
import { PublishingAutomationModule } from './publishing-automation/publishing-automation.module';
// import { AuditLogModule } from './audit-log/audit-log.module';

@Module({
  imports: [
    // 1. Global Environment Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.local', '.env'],
      validate: validateEnv,
    }),

    CacheModule,
    MailModule,
    StorageModule,

    // 2. Database Connection using our Enterprise Factory
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfigFactory,
    }),

    // 3. Global Rate Limiter (Throttler) with Redis Storage
    ThrottlerModule.forRootAsync({
      // We inject the globally available Redis client token
      inject: ['REDIS_CLIENT'],
      useFactory: (redisClient: Redis) => {
        // Tell ESLint to ignore the third-party constructor typing quirk
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const redisStorage = new ThrottlerStorageRedisService(redisClient);

        return {
          throttlers: [
            {
              name: 'default',
              ttl: 60000,
              limit: 100,
            },
          ],
          // Safely cast it to the expected interface
          storage: redisStorage as unknown as ThrottlerStorage,
        };
      },
    }),

    // 4. Initialization
    // Init the Cron Job runner
    ScheduleModule.forRoot(),
    // Init the Event Emitter
    // Tell ESLint to trust this official NestJS third-party method
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    EventEmitterModule.forRoot(),

    // 5. Importcentralized CronModule
    CronModule,

    // local docker redis
    // BullModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: (configService: ConfigService) => ({
    //     connection: {
    //       host: configService.get<string>('REDIS_HOST', 'localhost'),
    //       port: configService.get<number>('REDIS_PORT', 6379),
    //       // password: configService.get('REDIS_PASSWORD'),
    //     },
    //   }),
    //   inject: [ConfigService],
    // }),

    // Upstash-compatible BullMQ Connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const isTls =
          configService.get<string>('REDIS_TLS') === 'true' ||
          Boolean(redisUrl?.startsWith('rediss://'));

        if (redisUrl) {
          return {
            connection: {
              url: redisUrl,
              tls: isTls ? { rejectUnauthorized: false } : undefined,
              maxRetriesPerRequest: null, // Critical: BullMQ will crash without this set to null
            },
          };
        }

        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD') || undefined,
            tls: isTls ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null, // Critical: BullMQ will crash without this set to null
          },
        };
      },
    }),

    // 6. Application Modules
    AuthModule,
    UsersModule,
    DepartmentsModule,
    ProfilesModule,
    IdentityModule,
    UserAvatarsModule,
    RolesModule,
    PermissionsModule,
    SystemResourcesModule,
    NotificationsModule,
    AuditLogModule,
    TicketModule,
    AtsModule,
    PublishingAutomationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 1. Global Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },

    // 2. Global Rate Limiting Error Formatter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
