import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JobBoardWebhookGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // TopCV uses x-api-key, others might use Authorization
    // const apiKey = request.headers['x-api-key'];
    // const validKey = this.configService.get<string>('TOPCV_WEBHOOK_SECRET');
    const providedSecret = request.query.secret;
    const validKey = this.configService.get<string>('TOPCV_WEBHOOK_SECRET');

    // Skip validation if no secret is set in .env (useful for local dev)
    if (validKey && providedSecret !== validKey) {
      throw new UnauthorizedException('Invalid Webhook Signature');
    }

    return true;
  }
}
