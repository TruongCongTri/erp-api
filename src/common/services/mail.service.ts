import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendVerificationOtp(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Your Verification Code',
      // In production, use a template engine like Handlebars or EJS here
      html: `<p>Your verification code is: <strong>${otp}</strong></p>
             <p>This code expires in 5 minutes.</p>`,
    });
  }
}
