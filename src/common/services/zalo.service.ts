import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable } from 'rxjs';

export interface ZaloZnsResponse {
  error: number;
  message: string;
  data?: Record<string, unknown>;
}

// 1. Create a pristine, strict interface to mask the messy Axios types
interface StrictHttpService {
  post<T>(
    url: string,
    data: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Observable<{ data: T }>;
}

@Injectable()
export class ZaloService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendZnsOtp(phoneNumber: string, otp: string): Promise<void> {
    const accessToken = this.configService.get<string>('ZALO_ACCESS_TOKEN');
    const templateId = this.configService.get<string>('ZALO_OTP_TEMPLATE_ID');

    const formattedPhone = phoneNumber.replace(/^0/, '84');

    // 2. Explicitly type the payload and config to prevent implicit 'any'
    const payload: Record<string, unknown> = {
      phone: formattedPhone,
      template_id: templateId,
      template_data: {
        otp_code: otp,
      },
    };

    const config: Record<string, unknown> = {
      headers: {
        access_token: accessToken || '',
        'Content-Type': 'application/json',
      },
    };

    try {
      // 3. Safely cast HttpService to our strict interface.
      // This completely blocks ESLint from seeing the native Axios 'any' types!
      const strictHttp = this.httpService as unknown as StrictHttpService;

      const request$ = strictHttp.post<ZaloZnsResponse>(
        'https://business.openapi.zalo.me/message/template',
        payload,
        config,
      );

      // response is now cleanly inferred as { data: ZaloZnsResponse }
      const response = await firstValueFrom(request$);

      if (response.data.error !== 0) {
        throw new Error(`Zalo API Error: ${response.data.message}`);
      }
    } catch {
      throw new InternalServerErrorException('Failed to send Zalo OTP');
    }
  }
}
