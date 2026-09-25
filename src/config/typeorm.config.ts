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
// import 'tsconfig-paths/register';
import { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 1. Ensure env files load properly outside NestJS
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
  // Always force SSL if connecting to Supabase cloud
  const isSupabase =
    (host && host.includes('supabase.com')) ||
    (databaseUrl && databaseUrl.includes('supabase.com'));

  const shouldUseSsl = isSupabase || isSslEnabled;
  const sslConfig = shouldUseSsl ? { rejectUnauthorized: false } : false;

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

const parseBoolean = (val: unknown, fallback = true): boolean => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'boolean') return val;
  return (
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    String(val).trim().toLowerCase() === 'true' || String(val).trim() === '1'
  );
};

// Chuẩn hóa đường dẫn Entity và Migration bằng path.join (tương thích Windows & Linux)
const ENTITIES_PATH = [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')];
const MIGRATIONS_PATH = [
  path.join(__dirname, '..', 'migrations', '*{.ts,.js}'),
];

// 2. Factory for NestJS runtime (app.module.ts)
export const typeOrmConfigFactory = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl =
    configService.get<string>('DATABASE_URL') || process.env.DATABASE_URL;

  // Handles boolean true, string 'true', or number 1 from validateEnv
  const sslEnabled = parseBoolean(
    configService.get('DATABASE_SSL') ?? process.env.DATABASE_SSL,
    true, // default to true for remote Supabase
  );

  const host =
    configService.get<string>('DATABASE_HOST') ||
    process.env.DATABASE_HOST ||
    'localhost';
  const port = Number(
    configService.get<number>('DATABASE_PORT') ||
      process.env.DATABASE_PORT ||
      5432,
  );
  const username =
    configService.get<string>('DATABASE_USER') ||
    process.env.DATABASE_USER ||
    'postgres';
  const password =
    configService.get<string>('DATABASE_PASSWORD') ||
    process.env.DATABASE_PASSWORD;
  const database =
    configService.get<string>('DATABASE_NAME') ||
    process.env.DATABASE_NAME ||
    'postgres';

  const connectionProps = buildConnectionOptions(
    databaseUrl,
    host,
    port,
    username,
    password,
    database,
    sslEnabled,
  );

  return {
    type: 'postgres',
    ...connectionProps,
    // entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    entities: ENTITIES_PATH,
    synchronize: false,
    // migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrations: MIGRATIONS_PATH,
    migrationsTableName: 'migrations_history',
    logging: configService.get<string>('NODE_ENV') === 'development',
    retryAttempts: 5,
    retryDelay: 3000,
    verboseRetryLog: true,
  };
};

// 3. CLI DataSource configuration for running migrations
const cliSslEnabled = parseBoolean(process.env.DATABASE_SSL, true);

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
  // entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  entities: ENTITIES_PATH,
  synchronize: false,
  // migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrations: MIGRATIONS_PATH,
  migrationsTableName: 'migrations_history',
  logging: true,
};

export default new DataSource(cliConfig);
