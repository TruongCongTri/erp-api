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

        // DEBUGGING: This will print to your terminal when the server starts.
        // If these say "undefined", we know 100% the .env file is not loading!
        Logger.debug(`Loaded MAIL_USER: ${mailUser}`, 'MailModule');
        Logger.debug(
          `Loaded MAIL_PASS: ${mailPass ? '********' : 'MISSING!'}`,
          'MailModule',
        );

        return {
          transport: {
            service: 'gmail', // 👈 Use this instead of host/port/secure
            auth: {
              user: mailUser,
              pass: mailPass,
            },
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
