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

    // 6. Application Modules
    AuthModule,
    UsersModule,
    ProfilesModule,
    IdentityModule,
    UserAvatarsModule,
    RolesModule,
    PermissionsModule,
    SystemResourcesModule,
    NotificationsModule,
  ],
  controllers: [
    AppController,
    // SystemResourcesController safely removed from here.
    // It belongs exclusively in SystemResourcesModule!
  ],
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
