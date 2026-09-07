// src/config/typeorm.config.ts
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

// 1. Load environment variables for the TypeORM CLI (runs outside NestJS)
config();

// 2. The Factory for NestJS (app.module.ts)
export const typeOrmConfigFactory = (
  configService: ConfigService,
): DataSourceOptions => {
  const sslEnabled = configService.get<string>('DATABASE_SSL') === 'true';

  return {
    type: 'postgres',
    host: configService.get<string>('DATABASE_HOST', 'localhost'),
    port: configService.get<number>('DATABASE_PORT', 5432),
    username: configService.get<string>('DATABASE_USER', 'postgres'),
    password: configService.get<string>('DATABASE_PASSWORD', 'adminpassword'),
    database: configService.get<string>('DATABASE_NAME', 'chinh_nam_erp_db'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false, // STRICTLY FALSE IN ENTERPRISE
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations_history',
    logging: configService.get<string>('NODE_ENV') === 'development',

    // Supabase requires this for secure external connections
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,

    // Prevents overwhelming the Supabase transaction pooler
    extra: {
      max: 20,
      connectionTimeoutMillis: 5000,
    },
  };
};

// 3. The Default Export for TypeORM CLI (Migrations)
const cliSslEnabled = process.env.DATABASE_SSL === 'true';

const cliConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'adminpassword',
  database: process.env.DATABASE_NAME || 'chinh_nam_erp_db',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: true, // Set to true only in development
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations_history',
  logging: true,

  // Ensures migrations can run against the remote Supabase DB
  ssl: cliSslEnabled ? { rejectUnauthorized: false } : false,
  extra: {
    max: 20,
    connectionTimeoutMillis: 5000,
  },
};

export default new DataSource(cliConfig);
