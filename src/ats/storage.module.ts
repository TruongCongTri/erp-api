// src/common/storage/storage.module.ts
import { Global, Module } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service'; // Chỉnh lại đường dẫn import file s3-storage.service.ts của bạn

@Global()
@Module({
  providers: [S3StorageService],
  exports: [S3StorageService],
})
export class StorageModule {}
