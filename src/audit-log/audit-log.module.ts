import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLog } from './entities/audit-log.entity';
import { AuditExportJob } from './entities/audit-export-job.entity';
import { AuditRetentionPolicy } from './entities/audit-retention-policy.entity';

import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';

@Global() // Biến thành Global Module để không cần import lại ở từng module khác
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, AuditExportJob, AuditRetentionPolicy]),
  ],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    // Đăng ký Interceptor làm Global (Nó sẽ tự kiểm tra @AuditAction)
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
