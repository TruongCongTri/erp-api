// src/app.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getHealthStatus() {
    let isDbConnected = false;

    try {
      // Execute a raw, lightweight query to verify the connection pool is healthy
      await this.dataSource.query('SELECT 1');
      isDbConnected = true;
    } catch (error) {
      this.logger.error(
        'Database connection failed during health check',
        error,
      );
      isDbConnected = false;
    }

    return {
      status: isDbConnected ? 'ok' : 'error',
      database: isDbConnected ? 'connected' : 'disconnected',
      message: isDbConnected
        ? 'ERP API is running securely'
        : 'Database connection failed',
      timestamp: new Date().toISOString(),
    };
  }
}
