import Redis from 'ioredis';
import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MailerModule } from '@nestjs-modules/mailer';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailService as MService } from 'src/common/services/mail.service';
import { ZaloService } from 'src/common/services/zalo.service';
import { MailService } from 'src/mail/mail.service';
import { User } from 'src/users/entities/users.entity';
import { Role } from 'src/roles/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    ConfigModule, // To use ConfigService
    HttpModule, // To use HttpService inside ZaloService
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'fallback_secret',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ||
            '15m') as NonNullable<
            NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
          >,
        },
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
          port: configService.get<number>('SMTP_PORT') || 587,
          secure: configService.get<boolean>('SMTP_SECURE') || false,
          auth: {
            user: configService.get<string>('SMTP_USER') || '',
            pass: configService.get<string>('SMTP_PASS') || '',
          },
        },
        defaults: {
          from:
            configService.get<string>('SMTP_FROM') ||
            '"Chính Nam HR" <noreply@chinhnam.vn>',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    MailService,
    MService,
    ZaloService,

    // Registered the REDIS_CLIENT custom provider
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

        const client = new Redis(redisUrl, {
          // Retry connecting every 3 seconds if Redis is down, instead of crashing
          retryStrategy(times) {
            const delay = Math.min(times * 50, 3000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false, // Tránh ngập bộ nhớ RAM khi Redis ngắt kết nối
        });

        // Catch errors so they don't bubble up as "Unhandled error event"
        client.on('error', (err) => {
          console.warn('[Redis Client Warning]:', err.message);
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, JwtModule, 'REDIS_CLIENT'],
})
export class AuthModule {}
