import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

// @Catch() tells NestJS that this filter ONLY cares about ThrottlerExceptions
@Catch(ThrottlerException)
export class CustomThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus() || HttpStatus.TOO_MANY_REQUESTS;

    // Send a perfectly formatted JSON response back to the frontend
    response.status(status).json({
      statusCode: status,
      error: 'Too Many Requests',
      message:
        'You are making requests too quickly. Please wait a moment and try again.',
      timestamp: new Date().toISOString(),
    });
  }
}
