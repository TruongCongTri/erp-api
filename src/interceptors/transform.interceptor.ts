import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginationMetaDto } from '../common/dto/pagination.dto';

export interface SuccessResponseBody<T> {
  data?: T;
  meta: {
    success: boolean;
    status_code: number;
    message: string;
    pagination?: PaginationMetaDto;
  };
}

interface HttpResponse {
  statusCode: number;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponseBody<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponseBody<T>> {
    // Extract the HTTP response object to get the status code NestJS assigned
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const status_code = response.statusCode;

    return next.handle().pipe(
      // 1. Explicitly type 'res' as 'unknown' to block 'any' leaks
      map((res: unknown) => {
        // 2. Safely verify it is an object
        const isObject = res !== null && typeof res === 'object';

        // 3. Cast to a safe record so we can inspect properties without ESLint complaining
        const resObj = isObject ? (res as Record<string, unknown>) : {};

        // 4. Perform the checks safely
        const hasCustomOverrides =
          'data' in resObj || 'message' in resObj || 'meta' in resObj;

        // 5. Extract and safely cast properties
        const data = hasCustomOverrides
          ? (resObj.data as T | undefined)
          : (res as T);

        const message =
          hasCustomOverrides && typeof resObj.message === 'string'
            ? resObj.message
            : 'Operation successful';

        const pagination =
          hasCustomOverrides && resObj.meta !== undefined
            ? (resObj.meta as PaginationMetaDto)
            : undefined;

        // Construct the strict response
        return {
          ...(data !== undefined && { data }),
          meta: {
            success: true,
            status_code,
            message,
            ...(pagination !== undefined && { pagination }),
          },
        };
      }),
    );
  }
}
