import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// @Catch() without arguments tells NestJS to catch absolutely everything
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Defaults for 500 Internal Server Errors
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errors: unknown = undefined;
    let error_code: string | number | undefined = undefined;
    let exceptionData: unknown = undefined;

    // If it's an expected NestJS error (400, 401, 403, 404, 429, etc.)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Safely check if the response is an object
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        // Cast to a safe Record
        const resObj = exceptionResponse as Record<string, unknown>;

        // Handle class-validator BadRequestExceptions
        if (
          statusCode === HttpStatus.BAD_REQUEST &&
          Array.isArray(resObj.message)
        ) {
          message = 'Validation failed';
          errors = resObj.message;
        } else {
          // Handle standard HttpExceptions
          message =
            typeof resObj.message === 'string'
              ? resObj.message
              : exception.message;

          const extractedCode = resObj.error_code ?? resObj.error;
          error_code =
            typeof extractedCode === 'string' ||
            typeof extractedCode === 'number'
              ? extractedCode
              : undefined;

          errors = resObj.errors;

          exceptionData = resObj.data;
        }
      } else if (typeof exceptionResponse === 'string') {
        // Handle unhandled errors
        message = exception.message;
      } else {
        message = exception.message;
      }
    } else {
      // Unhandled Server Errors (Database crashes, TypeErrors, etc.)

      // 1. Log the actual error for the backend team to debug
      this.logger.error(
        `Unhandled Exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );

      // 2. Hide the actual error message from the client to prevent security leaks
      message = 'Internal server error';
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const responseBody: Record<string, any> = {
      meta: {
        success: false,
        status_code: statusCode,
        message,
        ...(error_code !== undefined && { error_code }),
        ...(errors !== undefined && { errors }),
      },
    };

    if (exceptionData !== undefined) {
      responseBody.data = exceptionData;
    }

    response.status(statusCode).json(responseBody);
  }
}
