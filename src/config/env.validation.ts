import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  validateSync,
  IsOptional,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV!: Environment;

  @IsNumber()
  PORT!: number;

  // Database
  @IsString()
  DATABASE_HOST!: string;

  @IsNumber()
  DATABASE_PORT!: number;

  @IsString()
  DATABASE_USER!: string;

  @IsString()
  DATABASE_PASSWORD!: string;

  @IsString()
  DATABASE_NAME!: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === '1')
  @IsBoolean()
  DATABASE_SSL?: boolean;

  // Redis
  @IsString()
  REDIS_URL!: string;

  @IsBoolean()
  REDIS_TLS!: boolean;

  @IsString()
  MAIL_USER!: string;

  @IsString()
  MAIL_PASS!: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;

  // AES-256-GCM key used to encrypt/decrypt Facebook session cookies at rest.
  @IsString()
  @IsOptional()
  ENCRYPTION_KEY?: string;

  // ATS AI provider switch: 'gemini' (default) or 'claude'.
  @IsString()
  @IsOptional()
  AI_PROVIDER?: string;

  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  // Comma-separated Gemini keys for rotation (also reads GEMINI_API_KEY_1..20).
  @IsString()
  @IsOptional()
  GEMINI_API_KEYS?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // Converts "3000" to 3000 and "true" to true
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return validatedConfig;
}
