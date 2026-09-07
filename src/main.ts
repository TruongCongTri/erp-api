import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000'], // The exact URL of your Next.js app
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true, // Crucial if you are passing cookies or Authorization headers
  });

  // 1. Set Global API Prefix (e.g., domain.com/api/...)
  app.setGlobalPrefix('api');

  // 2. Enable URI Versioning (e.g., domain.com/api/v1/...)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 3.Enable ValidationPipe to trigger class-validator checks
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 4. Enforce Success JSON Format
  app.useGlobalInterceptors(new TransformInterceptor());

  // 5. Enforce Error JSON Format
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(5000);
}
bootstrap();
