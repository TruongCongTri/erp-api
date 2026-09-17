// common/utils/dto-validator.util.ts
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InternalServerErrorException } from '@nestjs/common';

/**
 * Safely parses a JSON string into `unknown` without triggering ESLint `any` warnings.
 */
export function safeJsonParse(jsonString: string): unknown {
  return JSON.parse(jsonString) as unknown;
}

/**
 * Validates unknown JSON payloads against class-validator DTOs.
 */
export async function validateDtoPayload<T extends object>(
  dtoClass: ClassConstructor<T>,
  plainPayload: unknown,
): Promise<T> {
  if (!plainPayload || typeof plainPayload !== 'object') {
    throw new InternalServerErrorException(
      'Dữ liệu JSON từ AI phản hồi không hợp lệ (không phải object)',
    );
  }

  const instance = plainToInstance(dtoClass, plainPayload, {
    enableImplicitConversion: true,
  });

  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('; ');
    throw new InternalServerErrorException(
      `AI response validation failed: ${errorDetails}`,
    );
  }

  return instance;
}
