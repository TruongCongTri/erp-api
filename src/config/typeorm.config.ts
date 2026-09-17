// src/config/typeorm.config.ts
// local - postgreSQL (un-comment when use locally)

// import { DataSource, DataSourceOptions } from 'typeorm';
// import { ConfigService } from '@nestjs/config';
// import { config } from 'dotenv';

// // 1. Load environment variables for the TypeORM CLI (runs outside NestJS)
// config();

// // 2. The Factory for NestJS (app.module.ts)
// export const typeOrmConfigFactory = (
//   configService: ConfigService,
// ): DataSourceOptions => {
//   const sslEnabled = configService.get<string>('DATABASE_SSL') === 'true';

//   return {
//     type: 'postgres',
//     host: configService.get<string>('DATABASE_HOST', 'localhost'),
//     port: configService.get<number>('DATABASE_PORT', 5432),
//     username: configService.get<string>('DATABASE_USER', 'postgres'),
//     password: configService.get<string>('DATABASE_PASSWORD', 'adminpassword'),
//     database: configService.get<string>('DATABASE_NAME', 'chinh_nam_erp_db'),
//     entities: [__dirname + '/../**/*.entity{.ts,.js}'],
//     synchronize: false, // STRICTLY FALSE IN ENTERPRISE
//     migrations: [__dirname + '/../migrations/*{.ts,.js}'],
//     migrationsTableName: 'migrations_history',
//     logging: configService.get<string>('NODE_ENV') === 'development',

//     // Supabase requires this for secure external connections
//     ssl: sslEnabled ? { rejectUnauthorized: false } : false,

//     // Prevents overwhelming the Supabase transaction pooler
//     extra: {
//       max: 20,
//       connectionTimeoutMillis: 5000,
//     },
//   };
// };

// // 3. The Default Export for TypeORM CLI (Migrations)
// const cliSslEnabled = process.env.DATABASE_SSL === 'true';

// const cliConfig: DataSourceOptions = {
//   type: 'postgres',
//   host: process.env.DATABASE_HOST || 'localhost',
//   port: parseInt(process.env.DATABASE_PORT || '5432', 10),
//   username: process.env.DATABASE_USER || 'postgres',
//   password: process.env.DATABASE_PASSWORD || 'adminpassword',
//   database: process.env.DATABASE_NAME || 'chinh_nam_erp_db',
//   entities: [__dirname + '/../**/*.entity{.ts,.js}'],
//   synchronize: false, // Recommended false for CLI migration safety
//   migrations: [__dirname + '/../migrations/*{.ts,.js}'],
//   migrationsTableName: 'migrations_history',
//   logging: true,

//   // Ensures migrations can run against the remote Supabase DB
//   ssl: cliSslEnabled ? { rejectUnauthorized: false } : false,
//   extra: {
//     max: 20,
//     connectionTimeoutMillis: 5000,
//   },
// };

// export default new DataSource(cliConfig);

// online - Supabase
// import 'tsconfig-paths/register';
import { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 1. Ensure TypeORM CLI loads the same env files as NestJS
const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

interface ConnectionOptions {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl: boolean | { rejectUnauthorized: boolean };
  extra: {
    max: number;
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
    keepAlive: boolean;
  };
}

const buildConnectionOptions = (
  databaseUrl?: string,
  host?: string,
  port = 5432,
  username?: string,
  password?: string,
  database = 'postgres',
  isSslEnabled = true,
): ConnectionOptions => {
  const sslConfig = isSslEnabled ? { rejectUnauthorized: false } : false;

  // Supabase connection pooling (Session mode on port 5432 recommended)
  const poolConfig = {
    max: 15,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
  };

  if (databaseUrl) {
    return {
      url: databaseUrl,
      ssl: sslConfig,
      extra: poolConfig,
    };
  }

  return {
    host,
    port,
    username,
    password,
    database,
    ssl: sslConfig,
    extra: poolConfig,
  };
};

// 2. Factory for NestJS runtime (app.module.ts)
export const typeOrmConfigFactory = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  const sslEnabled =
    configService.get<string>('DATABASE_SSL', 'true') === 'true';

  const connectionProps = buildConnectionOptions(
    databaseUrl,
    configService.get<string>('DATABASE_HOST'),
    configService.get<number>('DATABASE_PORT', 5432),
    configService.get<string>('DATABASE_USER'),
    configService.get<string>('DATABASE_PASSWORD'),
    configService.get<string>('DATABASE_NAME', 'postgres'),
    sslEnabled,
  );

  return {
    type: 'postgres',
    ...connectionProps,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations_history',
    logging: configService.get<string>('NODE_ENV') === 'development',
    retryAttempts: 5,
    retryDelay: 3000,
    verboseRetryLog: true,
  };
};

// 3. CLI DataSource configuration for running migrations
const cliSslEnabled = process.env.DATABASE_SSL !== 'false';
const cliConnectionProps = buildConnectionOptions(
  process.env.DATABASE_URL,
  process.env.DATABASE_HOST,
  parseInt(process.env.DATABASE_PORT || '5432', 10),
  process.env.DATABASE_USER,
  process.env.DATABASE_PASSWORD,
  process.env.DATABASE_NAME || 'postgres',
  cliSslEnabled,
);

const cliConfig: DataSourceOptions = {
  type: 'postgres',
  ...cliConnectionProps,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations_history',
  logging: true,
};

export default new DataSource(cliConfig);
