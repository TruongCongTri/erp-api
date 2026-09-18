import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
  }

  async sendVerificationLink(
    email: string,
    userId: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );

    // Construct the clickable URL
    // e.g., http://localhost:3000/auth/verify?userId=123-abc&token=492810
    const verificationUrl = `${frontendUrl}/vi/verify?userId=${userId}&token=${token}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">Xác thực tài khoản của bạn</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          Chào bạn,<br/><br/>
          Cảm ơn bạn đã đăng ký tài khoản. Vui lòng nhấn vào nút bên dưới để xác thực địa chỉ email và kích hoạt tài khoản của bạn.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #007bff; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            Xác Thực Email
          </a>
        </div>
        <p style="color: #777; font-size: 14px; text-align: center;">
          Hoặc copy và dán đường dẫn sau vào trình duyệt:<br/>
          <a href="${verificationUrl}" style="color: #007bff; word-break: break-all;">${verificationUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 40px;">
          Link này sẽ hết hạn trong 5 phút. Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.
        </p>
      </div>
    `;

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Xác thực tài khoản - Kích hoạt email',
        html: htmlContent,
      });
      this.logger.log(`Verification link sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw error; // Bubble the error up to the caller's try/catch block
    }
  }
  // async sendVerificationLink(email: string, userId: string, token: string) {
  //   const url = `${this.configService.get('FRONTEND_URL')}/vi/verify?userId=${userId}&token=${token}`;

  //   await this.resend.emails.send({
  //     from: 'onboarding@resend.dev', // Hoặc domain doanh nghiệp của bạn
  //     to: email,
  //     subject: 'Xác thực tài khoản của bạn',
  //     html: `<p>Nhấn vào <a href="${url}">đây</a> để kích hoạt tài khoản.</p>`,
  //   });
  // }

  async sendVerificationOTP(
    email: string,
    fullName: string,
    otp: string,
  ): Promise<void> {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">Mã Xác Thực OTP</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          Chào <strong>${fullName}</strong>,<br/><br/>
          Bạn đang yêu cầu liên kết tài khoản với hồ sơ nhân viên trên hệ thống. Vui lòng sử dụng mã OTP dưới đây để hoàn tất quá trình xác thực.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background-color: #f4f4f4; color: #333; padding: 15px 30px; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 8px; border: 1px dashed #ccc; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 40px;">
          Mã OTP này sẽ hết hạn trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai để đảm bảo an toàn.
        </p>
      </div>
    `;

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Mã xác thực OTP - Liên kết hồ sơ nhân viên',
        html: htmlContent,
      });
      this.logger.log(`OTP sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}`, error);
      throw error;
    }
  }
}
