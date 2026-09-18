import { Logger, Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const mailUser = configService.get<string>('MAIL_USER');
        const mailPass = configService.get<string>('MAIL_PASS');
        const mailHost = configService.get<string>(
          'MAIL_HOST',
          'smtp.gmail.com',
        );
        const mailPort = Number(configService.get<string>('MAIL_PORT', '587'));

        // DEBUGGING: This will print to your terminal when the server starts.
        // If these say "undefined", we know 100% the .env file is not loading!
        Logger.debug(`Loaded MAIL_USER: ${mailUser}`, 'MailModule');
        Logger.debug(
          `Loaded MAIL_PASS: ${mailPass ? '********' : 'MISSING!'}`,
          'MailModule',
        );
        Logger.debug(`Using SMTP Host: ${mailHost}:${mailPort}`, 'MailModule');

        return {
          transport: {
            host: mailHost,
            port: mailPort,
            secure: false, // Bắt buộc là false đối với cổng 587 (Sử dụng STARTTLS)
            auth: {
              user: mailUser,
              pass: mailPass,
            },
            tls: {
              rejectUnauthorized: false, // Bỏ qua lỗi chứng chỉ trên môi trường Cloud Container
            },
            connectionTimeout: 15000, // Thiết lập timeout 15 giây tránh bị treo kết nối
            greetingTimeout: 15000,
            socketTimeout: 15000,
          },
          defaults: {
            from: `"Hệ thống quản lý" <${mailUser}>`,
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
