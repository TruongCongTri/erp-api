# Developer Guide: Chinh Nam ERP API

Step-by-step how-tos for working in this NestJS codebase. Each section is standalone. A matching AI prompt for every section is in [AI_PROMPTS.md](AI_PROMPTS.md).

> **Secrets:** never paste real passwords, API keys or connection strings into this file, into `.env.example`, or into a commit. Real values belong only in your local `.env` (which is git-ignored) or in your hosting provider's environment settings.

## Contents

1. [First-time setup](#1-first-time-setup)
2. [Database: switching between Local Postgres and Supabase](#2-database-switching-between-local-postgres-and-supabase)
3. [Redis: switching between Local Redis and Upstash](#3-redis-switching-between-local-redis-and-upstash)
4. [Environment switch cheat-sheet](#4-environment-switch-cheat-sheet)
5. [Create a complete feature module](#5-create-a-complete-feature-module)
   - 5.1 [Caching](#51-caching)
   - 5.2 [Permission restriction (RBAC)](#52-permission-restriction-rbac)
   - 5.3 [Entity indexes](#53-entity-indexes)
   - 5.4 [Domain events](#54-domain-events)
   - 5.5 [Push (real-time in-app) notifications](#55-push-real-time-in-app-notifications)
6. [Creating or updating entities (migrations)](#6-creating-or-updating-entities-migrations)
7. [Other how-tos](#7-other-how-tos)
   - 7.1 [Background jobs with BullMQ](#71-background-jobs-with-bullmq)
   - 7.2 [Cron jobs](#72-cron-jobs)
   - 7.3 [Audit logging](#73-audit-logging)
   - 7.4 [Response format, DTO validation and pagination](#74-response-format-dto-validation-and-pagination)
   - 7.5 [Adding a new environment variable](#75-adding-a-new-environment-variable)
   - 7.6 [Seeding data](#76-seeding-data)
   - 7.7 [Deployment checklist](#77-deployment-checklist)
   - 7.8 [Troubleshooting](#78-troubleshooting)
8. [Bonus: warnings and best practices](#8-bonus-warnings-and-best-practices)
   - 8.1 [⚠️ Known warnings in the current codebase](#81-️-known-warnings-in-the-current-codebase)
   - 8.2 [BullMQ: trigger-driven, never polling](#82-bullmq-trigger-driven-never-polling)
   - 8.3 [Non-blocking I/O inside the app](#83-non-blocking-io-inside-the-app)
   - 8.4 [Calling third-party APIs](#84-calling-third-party-apis)
   - 8.5 [Receiving webhooks](#85-receiving-webhooks)
   - 8.6 [Data integrity: transactions, concurrency, money, time](#86-data-integrity-transactions-concurrency-money-time)
   - 8.7 [Security and personal data](#87-security-and-personal-data)
   - 8.8 [Running more than one instance](#88-running-more-than-one-instance)
   - 8.9 [Performance and cost guardrails](#89-performance-and-cost-guardrails)
   - 8.10 [Pre-merge checklist](#810-pre-merge-checklist)

---

## 1. First-time setup

1. Install Node.js **22.12 or newer**, then run:
   ```bash
   npm install
   ```
2. Copy the env template and fill in real values:
   ```bash
   cp .env.example .env
   ```
3. Start local Postgres and Redis. Docker is the easiest way:
   ```bash
   docker run -d --name erp-postgres -p 5432:5432 \
     -e POSTGRES_PASSWORD=adminpassword -e POSTGRES_DB=chinh_nam_erp_db_test postgres:16
   docker run -d --name erp-redis -p 6379:6379 redis:7
   ```
4. Switch the DB and Redis to **local** mode (sections [2](#2-database-switching-between-local-postgres-and-supabase) and [3](#3-redis-switching-between-local-redis-and-upstash)).
5. Build the schema and load demo data:
   ```bash
   npm run seed          # ⚠️ drops and rebuilds the whole schema, then seeds roles/users/departments
   npm run seed:ats      # optional: ATS demo data from src/data/ats.json
   ```
6. Run the API:
   ```bash
   npm run start:dev
   ```
   The API is served at `http://localhost:5000/api/v1/...`.

---

## 2. Database: switching between Local Postgres and Supabase

Two files control the DB connection:

| File | What it holds |
|---|---|
| [src/config/typeorm.config.ts](../src/config/typeorm.config.ts) | Two code variants: **local PostgreSQL** (top, commented block) and **online Supabase** (bottom, currently active). |
| `.env` | Three connection blocks: **Local DB**, Supabase **ipv4**, and Supabase **ipv6**. |

> **Rule:** exactly one code variant must be active in `typeorm.config.ts`, and only one set of `DATABASE_*` values may be active in `.env`. If a key appears twice in `.env`, the last one wins, and that is easy to miss.

> **Watch `DATABASE_URL`:** the Supabase variant of `typeorm.config.ts` **uses `DATABASE_URL` whenever it is set and ignores `DATABASE_HOST`/`PORT`/`USER`/…**. When you switch to anything else, make sure no stray `DATABASE_URL` line is still active.

### 2.1 Local: use local Postgres

**Step 1: `src/config/typeorm.config.ts`**

1. Uncomment the whole block under `// local - postgreSQL (un-comment when use locally)`, from `import { DataSource, DataSourceOptions } …` through `export default new DataSource(cliConfig);`.
2. Comment out the whole block under `// online - Supabase`, from `import { DataSource, DataSourceOptions } …` through the final `export default new DataSource(cliConfig);`.
3. Check that the file has only **one** `typeOrmConfigFactory` export and only **one** `export default`. If there are two, the file will not compile.

**Step 2: `.env`**

1. Uncomment the `# START - Local DB` … `# END - Local DB` block:
   ```env
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=adminpassword
   DATABASE_NAME=chinh_nam_erp_db_test
   DATABASE_SSL=false
   ```
2. Comment out **every** Supabase line, including the `DATABASE_HOST/PORT/USER/PASSWORD/NAME/SSL` lines and `DATABASE_URL` below `# END - Supabase DB`.

**Step 3: verify**
```bash
npm run migration:run     # should connect to localhost and print "No migrations are pending" or run them
npm run start:dev
```

> The local code variant reads only `.env` when running CLI commands (`config()`), not `.env.local` or `.env.development.local`.

### 2.2 Local: use Supabase

**Step 1: `src/config/typeorm.config.ts`**: make sure the **online - Supabase** block is active and the local block is commented out (the reverse of 2.1).

**Step 2: `.env`**

1. Comment out the **Local DB** block.
2. In the Supabase section, **uncomment the `ipv6 for local` block** and **comment out the `ipv4 for deployment` block**:
   ```env
   # // ipv4 for deployment
   # DATABASE_HOST=...
   # DATABASE_URL=...

   # // ipv6 for local
   DATABASE_HOST=aws-0-<region>.pooler.supabase.com
   DATABASE_PORT=5432
   DATABASE_USER=postgres.<project-ref>
   DATABASE_PASSWORD=<url-encoded-password>
   DATABASE_NAME=postgres
   DATABASE_SSL=true
   DATABASE_URL=postgresql://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Tips:
   - The password must be **URL-encoded** (`@` → `%40`, `$` → `%24`, `%` → `%25`, `/` → `%2F`).
   - When you use the **pooler** host, the username must include the project ref: `postgres.<project-ref>`.
   - SSL is forced on automatically whenever the host contains `supabase.com`.
   - Start comment lines in `.env` with `#`, not `//`. Change the existing `// ipv4 …` and `// ipv6 …` labels to `# …`.

**Step 3: verify**: `npm run start:dev`. Look for TypeORM connecting without `ENETUNREACH` or `ETIMEDOUT` errors.

> ⚠️ When `.env` points at Supabase, **every** CLI command (`migration:run`, `schema:drop`, `seed`, `db:reset`) runs against that remote database. Never run `seed` or `db:reset` against a shared or production Supabase project (see [7.6](#76-seeding-data)).

### 2.3 Deployment (reverse of local)

1. `typeorm.config.ts`: the **online - Supabase** block must be active, and the local block commented out. **Commit this state.** The deployed build uses whatever is committed.
2. Environment variables on the host (Render, Railway, VPS, Docker and so on). Use the **ipv4 for deployment** values and do **not** use the ipv6 values:
   ```env
   DATABASE_HOST=aws-0-<region>.pooler.supabase.com
   DATABASE_PORT=5432
   DATABASE_USER=postgres.<project-ref>
   DATABASE_PASSWORD=<url-encoded-password>
   DATABASE_NAME=postgres
   DATABASE_SSL=true
   DATABASE_URL=<ipv4-compatible connection string>
   ```
3. Run pending migrations against production **once**, from CI or your machine, pointed at production:
   ```bash
   npm run migration:run
   ```

> **About IPv4 and IPv6:** Supabase's *direct* host (`db.<ref>.supabase.co`) is IPv6-only unless you buy the IPv4 add-on. The *pooler* host (`aws-0-<region>.pooler.supabase.com`) works over IPv4. Most cloud hosts only have IPv4 outbound, so production `DATABASE_URL` should point at the **pooler** host. The current `ipv4 for deployment` block has a `DATABASE_URL` that uses the direct `db.…supabase.co` host. Because `DATABASE_URL` overrides the host fields, check that URL before you deploy.

---

## 3. Redis: switching between Local Redis and Upstash

Redis is used for the cache, auth sessions, the rate limiter and BullMQ queues. Two code files have a **local** variant and an **Upstash** variant, and you switch by commenting and uncommenting:

| File | Local block | Upstash block |
|---|---|---|
| [src/common/cache/cache.module.ts](../src/common/cache/cache.module.ts) | under `// local docker redis` | under `// upstash redis` |
| [src/app.module.ts](../src/app.module.ts) (`BullModule.forRootAsync`) | under `// local docker redis` | under `// Upstash-compatible BullMQ Connection` |

### 3.1 Local

**Step 1: `src/common/cache/cache.module.ts`**
1. Uncomment the `// local docker redis` block (`@Global() @Module({...}) export class CacheModule {}`).
2. Comment out the `// upstash redis` block.
3. Only one `export class CacheModule` may be active.

**Step 2: `src/app.module.ts`**
1. Uncomment the `BullModule.forRootAsync({...})` under `// local docker redis`.
2. Comment out the `BullModule.forRootAsync({...})` under `// Upstash-compatible BullMQ Connection`.
3. Only one `BullModule.forRootAsync` may be active in the `imports` array.

**Step 3: `.env`**
1. Uncomment the local Redis block:
   ```env
   REDIS_URL=redis://localhost:6379
   REDIS_TLS=false
   ```
2. Comment out the Upstash block (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS=true`, `REDIS_URL=rediss://…`).

> `REDIS_URL` and `REDIS_TLS` are **required** by [env.validation.ts](../src/config/env.validation.ts). If neither block is active, the app refuses to start.

**Step 4: verify**: `docker ps` shows Redis running, and `npm run start:dev` starts without `Redis error:` warnings.

### 3.2 Deployment (reverse)

1. `cache.module.ts`: **Upstash** block active, local block commented out.
2. `app.module.ts`: **Upstash-compatible BullMQ** block active, local block commented out.
3. Commit both files.
4. Environment variables on the host:
   ```env
   REDIS_URL=rediss://default:<password>@<name>.upstash.io:6379   # note: rediss:// (TLS)
   REDIS_TLS=true
   ```
   `REDIS_HOST`, `REDIS_PORT` and `REDIS_PASSWORD` are only used as a fallback when `REDIS_URL` is empty. `REDIS_HOST` must be a bare hostname, not a URL beginning with `https://`.

> BullMQ workers poll Redis all the time. On Upstash's pay-per-request or free tier, this uses up the command quota even when the app is idle. Watch the usage dashboard.

---

## 4. Environment switch cheat-sheet

| Scenario | `typeorm.config.ts` | `.env` DB block | `cache.module.ts` | `app.module.ts` Bull | `.env` Redis block |
|---|---|---|---|---|---|
| Fully local | local | Local DB | local | local | Local Redis |
| Local code + Supabase | online | Supabase **ipv6** | local | local | Local Redis |
| Local code + Supabase + Upstash | online | Supabase **ipv6** | upstash | upstash | Upstash |
| **Deployment** | online | Supabase **ipv4** (host env) | upstash | upstash | Upstash (host env) |

Before committing, run `git diff src/config/typeorm.config.ts src/common/cache/cache.module.ts src/app.module.ts` and make sure you are committing the **deployment** variant, unless the team agrees otherwise.

---

## 5. Create a complete feature module

The example builds a feature called **`projects`**. Replace the names with your own. The [departments](../src/departments/) module is the cleanest reference.

### 5.0 Folder layout

```
src/projects/
├── dto/
│   ├── create-project.dto.ts
│   ├── update-project.dto.ts
│   └── query-project.dto.ts
├── entities/
│   └── project.entity.ts
├── enums/
│   └── project.enum.ts            (optional)
├── projects.events.ts             (5.4)
├── projects-notifications.listener.ts  (5.5)
├── projects.controller.ts
├── projects.service.ts
└── projects.module.ts
```

### Step 1: Entity

`src/projects/entities/project.entity.ts`:

```ts
import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AuditableEntity } from 'src/common/entities/auditable.entity';
import { Department } from 'src/departments/entities/department.entity';

@Entity('projects')
@Index('idx_projects_dept_status_deleted', ['departmentId', 'status', 'deletedAt'])
export class Project extends AuditableEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 32, unique: true })
  code!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: string;

  @Index('idx_projects_department_id')
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId?: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Index('idx_projects_owner_id')
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;
}
```

Conventions:
- Extend `AuditableEntity`. It gives you `createdAt` (indexed), `updatedAt`, `createdBy/Name`, `updatedBy/Name` and soft-delete (`deletedAt`, `deletedBy/Name`, hidden from `SELECT` by default).
- Use a UUID primary key.
- Use camelCase properties and snake_case DB columns (`name: 'department_id'`).
- Files must be named `*.entity.ts`. TypeORM finds them by glob, so you don't need to list them anywhere.

### Step 2: DTOs

```ts
// dto/create-project.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';
export class CreateProjectDto {
  @IsString() @IsNotEmpty() @MaxLength(32) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsUUID('4') departmentId?: string;
}

// dto/update-project.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto';
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

// dto/query-project.dto.ts
import { IsOptional, IsIn, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dto/base-query.dto';
export const PROJECT_SORT_FIELDS = ['name', 'code', 'createdAt'] as const;
export class QueryProjectDto extends BaseQueryDto {   // gives page, limit, cursor, search, sortBy, sortOrder
  @IsOptional() @IsUUID('4') departmentId?: string;
  @IsOptional() @IsIn(PROJECT_SORT_FIELDS) override sortBy?: (typeof PROJECT_SORT_FIELDS)[number] = 'createdAt';
}
```

The global `ValidationPipe` uses `whitelist: true`, so **fields without a validator decorator are silently removed** from the request.

### Step 3: Service (CRUD, cache, events)

See [5.1](#51-caching) and [5.4](#54-domain-events) for the details. Skeleton:

```ts
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    readonly cacheService: CacheService,        // must be named cacheService and not private (used by @Cacheable/@CacheClear)
    private readonly eventEmitter: EventEmitter2,
  ) {}
  // create / findAll / findOne / update / remove ...
}
```

Use `this.projectRepo.softDelete(id)` for deletes and write `deletedBy` / `deletedByName` first.

### Step 4: Controller

```ts
@Controller('projects')                                  // → /api/v1/projects
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequireAnyPermissions('project:read:any', 'project:read:dept', 'project:read:own')
  async findAll(@Query() query: QueryProjectDto, @CurrentUser() user: ActiveUserData) {
    const result = await this.projectsService.findAll(query, user);
    return { data: result.data, meta: result.meta, message: 'Projects retrieved successfully' };
  }
}
```

Put static routes (for example `@Get('tree')`) **before** parameterized routes (`@Get(':id')`).

### Step 5: Module

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Project]), NotificationsModule /* only if you push notifications */],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsNotificationsListener],
  exports: [ProjectsService],
})
export class ProjectsModule {}
```

You do **not** need to import `CacheModule`, `ConfigModule`, `EventEmitterModule` or `AuditLogModule`, because they are global.

### Step 6: Register in `AppModule`

Add `ProjectsModule` to the `// 6. Application Modules` list in [src/app.module.ts](../src/app.module.ts).

### Step 7: Permissions, migration and test

1. Register the RBAC resource and grant it to roles ([5.2](#52-permission-restriction-rbac)).
2. Generate and run the migration ([6](#6-creating-or-updating-entities-migrations)).
3. Run `npm run lint`, `npm run build` and `npm run start:dev`, then call the endpoints with a JWT from `POST /api/v1/auth/login`.

---

### 5.1 Caching

The building blocks are in [src/common/cache/](../src/common/cache/):

- `CacheService`: `get`, `set(key, value, ttlSeconds?)`, `del(...keys)`, `delPattern(pattern)` (uses SCAN, so it doesn't block Redis), and `getOrSet(key, fetcher, ttl, forceRefresh)`.
- `@Cacheable({ key, ttlSeconds?, forceRefresh? })`: caches the return value of a read method.
- `@CacheClear({ key, isPattern? })`: deletes keys **after** a write method succeeds.

**Step 1.** Inject the service as `readonly cacheService: CacheService`. The decorators read `this.cacheService`, so the name must match exactly and the field must not be `private`.

**Step 2.** Cache reads:

```ts
@Cacheable({
  key: (query: unknown) => `projects:list:${JSON.stringify(query)}`,
  forceRefresh: (_q: unknown, bypass: unknown) => bypass === true,
  ttlSeconds: 3600,
})
async findAll(query: QueryProjectDto, _bypassCache?: boolean) { ... }

@Cacheable({
  key: (id: unknown) => `project:${id as string}`,
  forceRefresh: (_id: unknown, bypass: unknown) => bypass === true,
  ttlSeconds: 86400,
})
async findOne(id: string, _bypassCache?: boolean) { ... }
```

The `key` and `forceRefresh` functions receive the **same arguments as the method**, in the same order. The controller can accept `?refresh=true` and pass `refresh === 'true'` as the bypass flag.

**Step 3.** Invalidate on writes:

```ts
@CacheClear({ key: ['projects:list:*'], isPattern: true })
async create(dto: CreateProjectDto, user: ActiveUserData) { ... }

@CacheClear({ key: (id: unknown) => ['projects:list:*', `project:${id as string}`], isPattern: true })
async update(id: string, dto: UpdateProjectDto, user: ActiveUserData) { ... }
```

`isPattern: true` applies to **every** key in the array. Exact keys also work as patterns.

**Rules and gotchas**

- **Key naming:** `<feature>:list:<json-query>` for lists and `<feature>:<id>` for single items. If a record can be fetched by id **and** slug, clear both keys.
- **Dates become strings on a cache hit.** Values are stored as JSON, so a cached `createdAt` comes back as an ISO string, not a `Date`. Don't call `.toISOString()` or `.getTime()` on data that may come from the cache.
- **Per-user data:** include the user id or department id in the key (`projects:list:${user.id}:${json}`). If you don't, one user's scoped list is served to another user.
- **Don't cache** results that depend on permissions unless the key includes the scope.
- **Manual invalidation from another service:** `await this.cacheService.delPattern('projects:*')`.
- **Permission snapshots:** the logged-in user's permissions are cached under `auth:snapshot:<userId>` for **10 minutes**. After changing a user's role or permissions, `del` that key, or the change only takes effect when the key expires.
- `CacheController` (`DELETE system/cache?pattern=`) exists but is **not registered** in any module and has no auth guard. Add guards before you expose it.

---

### 5.2 Permission restriction (RBAC)

A permission is a string in the form **`resource:action:scope`**:
- **action:** `create | read | update | delete | manage | approve | audit | process` (and `*`)
- **scope:** `any` (everything) › `dept` (own department) › `own` (own records)

Examples: `project:read:dept`, `project:approve:any`.

**Step 1: register the resource.** Add it to [src/data/resources.ts](../src/data/resources.ts):
```ts
{ slug: 'project', name: 'Project', description: 'Construction projects and milestones' },
```

**Step 2: grant it to roles.** In [src/data/roles-matrix.ts](../src/data/roles-matrix.ts), use the helpers from [permission-builder.ts](../src/auth/utils/permission-builder.ts):
```ts
defineRole('DIR_PROJECT', 'Giám đốc Dự án',
  forDeptHead(grant('project', ['create', 'read', 'update', 'approve'], 'dept')),
),
defineRole('STAFF_PROJECT', 'Nhân viên Dự án',
  forStaff([...grant('project', ['create', 'update'], 'own'), 'project:read:dept']),
),
```
If a permission should be part of every head or staff bundle, add it to `DEPT_HEAD_COMMON_PERMS` or `STAFF_COMMON_PERMS` instead.

**Step 3: apply it.**
- **Local:** `npm run seed`. This rebuilds everything. Wildcards such as `project:*:dept` are expanded into concrete permissions.
- **Existing or production DB:** do **not** seed. Create the resource and permissions and attach them to roles through the admin API: `POST /api/v1/resources`, `POST /api/v1/permissions`, `PATCH /api/v1/roles/:id/permissions`. Users receive the new permissions after re-login or within 10 minutes (the `auth:snapshot` TTL).

**Step 4: protect routes.**
```ts
@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)          // JwtAuthGuard must run first so req.user exists
export class ProjectsController {
  @Post()
  @RequirePermissions('project:create:dept')          // user needs ALL of these
  create(...) {}

  @Get()
  @RequireAnyPermissions('project:read:any', 'project:read:dept', 'project:read:own')  // user needs ONE of these
  findAll(...) {}
}
```

**Step 5: filter data by scope in the service.** The guard only answers "may this user call the route?". The **service** decides *which rows* they see:
```ts
import { hasPermission, getUserDepartmentId, ExtendedUser } from 'src/common/utils/ats-rbac.util';

if (hasPermission(user as ExtendedUser, 'project', 'read', 'any')) {
  // no filter
} else if (hasPermission(user as ExtendedUser, 'project', 'read', 'dept')) {
  const deptId = await getUserDepartmentId(this.projectRepo.manager, user as ExtendedUser);
  qb.andWhere('p.departmentId = :deptId', { deptId });
} else {
  qb.andWhere('p.ownerId = :uid', { uid: user.id });
}
```

**Gotchas**
- `PermissionsGuard` matches **exact strings**. It does *not* treat `any` as covering `dept`. List every acceptable scope in `@RequireAnyPermissions`. (The `hasPermission()` helper *does* apply `any ⊇ dept ⊇ own`.)
- Users with `*:*:any` bypass the guard, and so do the role slugs `SUPER_ADMIN` and `EXEC_CEO`.
- A route with `JwtAuthGuard` but no permission decorator is open to **any logged-in user**.
- A route with no guard at all is **public**.

---

### 5.3 Entity indexes

Add an index for every column you **filter, join or sort on** in a hot query. Indexes are declared on the entity and created by the migration.

| Need | How |
|---|---|
| Single column | `@Index('idx_projects_owner_id')` on the property |
| Unique column | `@Column({ unique: true })` (creates the index automatically, so don't add `@Index` too) |
| Composite | class-level `@Index('idx_projects_dept_status', ['departmentId', 'status'])` |
| Composite unique | `@Index('idx_x_unique', ['a', 'b'], { unique: true })` |
| Partial (filtered) | `@Index('idx_x_active', ['a'], { where: 'deleted_at IS NULL' })` |
| Unique among non-deleted rows | `@Index('idx_x', ['candidateId','jobPostId'], { unique: true, where: 'deleted_at IS NULL AND job_post_id IS NOT NULL' })` |

Steps:
1. Name indexes explicitly as `idx_<table>_<columns>`. Explicit names keep migrations stable and readable.
2. In composite indexes, put the **equality-filter columns first**, then range or sort columns (`['departmentId', 'status', 'createdAt']`).
3. For soft-deleted tables whose lists always filter `deleted_at IS NULL`, add `deletedAt` to the composite or use a partial index.
4. `where:` clauses use **database column names** (`deleted_at`, `job_post_id`), not property names.
5. Foreign-key columns are **not** indexed automatically in Postgres. Add `@Index` on every `*_id` you join or filter by.
6. `created_at` is already indexed by `AuditableEntity`.
7. Generate a migration ([6](#6-creating-or-updating-entities-migrations)) and check that it only contains the `CREATE INDEX` or `DROP INDEX` statements you expect.

Examples in the code: [department.entity.ts](../src/departments/entities/department.entity.ts), [job-application.entity.ts](../src/ats/entities/job-application.entity.ts) (partial and unique), [notification.entity.ts](../src/notifications/entities/notification.entity.ts).

---

### 5.4 Domain events

Events decouple the main action ("project created") from side effects such as notifications, emails, audit and AI jobs. `EventEmitterModule.forRoot()` is already registered globally.

**Step 1: define the event classes** in `src/projects/projects.events.ts`:
```ts
export class ProjectCreatedEvent {
  constructor(
    public readonly projectId: string,
    public readonly code: string,
    public readonly name: string,
    public readonly ownerId: string,
    public readonly departmentId?: string | null,
  ) {}
}
```

**Step 2: emit** from the service **after** the DB write succeeds (after the transaction commits, if you use one):
```ts
constructor(private readonly eventEmitter: EventEmitter2, ...) {}

const saved = await this.projectRepo.save(entity);
this.eventEmitter.emit('project.created',
  new ProjectCreatedEvent(saved.id, saved.code, saved.name, saved.ownerId, saved.departmentId));
```
Name events `<domain>.<past_tense_action>`, for example `project.created`, `project.status_changed` or `ticket.sla_breached`.

**Step 3: listen** in a dedicated provider:
```ts
@Injectable()
export class ProjectsEventsListener {
  private readonly logger = new Logger(ProjectsEventsListener.name);

  @OnEvent('project.created', { async: true })
  async handleCreated(event: ProjectCreatedEvent): Promise<void> {
    try {
      // side effect...
    } catch (err) {
      this.logger.error(`project.created handler failed: ${(err as Error).message}`);
    }
  }
}
```

**Step 4:** add the listener to `providers` of a module that is imported into `AppModule`. A listener class that isn't registered never fires.

**Rules**
- Keep payloads small and serializable: ids and snapshot strings, not entities.
- Listeners must **not throw**. Catch and log errors so a failing side effect doesn't break the request.
- `EventEmitter2` runs in memory only. If the process restarts, pending events are lost, and there are no retries. For work that must survive or retry (AI calls, file processing, third-party APIs), push a **BullMQ job** from the listener instead ([7.1](#71-background-jobs-with-bullmq)).

References: [ticket.events.ts](../src/tickets/ticket.events.ts), [ats-domain.events.ts](../src/ats/ats-domain.events.ts), [ats-domain-events.listener.ts](../src/ats/ats-domain-events.listener.ts).

---

### 5.5 Push (real-time in-app) notifications

"Push" here means an **in-app notification**: a row is saved in the `notifications` table and sent to the user in real time through **Socket.IO** by [NotificationsGateway](../src/notifications/notifications.gateway.ts). There is **no** mobile or web push (FCM/APNs) yet. `DeliveryChannel.PUSH`, `EMAIL` and `ZALO_ZNS` are enum values only, and only `IN_APP` is delivered.

**How it works:** the client connects with a JWT, the gateway puts it in the room `user_<userId>`, and `pushToUser(userId, payload)` emits the `notification` event to that room.

**Step 1: import `NotificationsModule`** in your feature module. The gateway is exported from there.
```ts
imports: [TypeOrmModule.forFeature([Project, Notification, User]), NotificationsModule],
providers: [ProjectsService, ProjectsNotificationsListener],
```

**Step 2: create a listener** that turns domain events into notifications. Follow the pattern in [publishing-automation-notifications.listener.ts](../src/publishing-automation/publishing-automation-notifications.listener.ts):
```ts
@Injectable()
export class ProjectsNotificationsListener {
  private readonly logger = new Logger(ProjectsNotificationsListener.name);

  constructor(
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly gateway: NotificationsGateway,
  ) {}

  @OnEvent('project.created', { async: true })
  async handleCreated(event: ProjectCreatedEvent): Promise<void> {
    try {
      const owner = await this.userRepo.findOneBy({ id: event.ownerId });
      if (!owner) return;

      const notif = this.notificationRepo.create({
        recipientId: owner.id,
        organizationId: owner.organizationId ?? '00000000-0000-0000-0000-000000000000',
        departmentId: owner.departmentId ?? 'GLOBAL',
        category: NotificationCategory.TASK,
        taskType: 'PROJECT_CREATED',                 // UPPER_SNAKE, used by the FE for icons and filters
        priority: NotificationPriority.NORMAL,
        actorType: ActorType.USER,
        title: `Dự án mới [${event.code}]`,
        body: event.name,
        targetEntityType: 'Project',
        targetEntityId: event.projectId,
        actionUrl: `/projects/${event.projectId}`,  // FE route to open on click
        deliveryChannels: [DeliveryChannel.IN_APP],
      });
      const saved = await this.notificationRepo.save(notif);

      this.gateway.pushToUser(saved.recipientId, {
        id: saved.id, title: saved.title, message: saved.body,
        actionUrl: saved.actionUrl, createdAt: saved.createdAt, isRead: saved.isRead,
      });
    } catch (err) {
      this.logger.error(`project.created notification failed: ${(err as Error).message}`);
    }
  }
}
```

**Step 3 (optional): trigger a UI refresh without saving a notification row:**
```ts
this.gateway.emitSystemEventToUser(userId, 'invalidate_projects', { projectId });
```

**Step 4: frontend contract**
```ts
const socket = io(API_URL, { auth: { token: accessToken } });
socket.on('notification', (n) => { /* show a toast, bump the bell counter */ });
socket.on('invalidate_projects', () => { /* refetch */ });
```
The REST endpoints under `/api/v1/notifications` handle listing and marking notifications read.

**Tips**
- To notify many users (for example all HR), build an array of rows, `save()` them in one call, then `pushToUser` for each saved row.
- Leave out the actor. Don't notify the user who performed the action.
- For email, use the mail service in [src/mail/](../src/mail/) from the same listener.

---

## 6. Creating or updating entities (migrations)

`synchronize` is **false**. Schema changes reach the database **only through migrations**. Never turn `synchronize` on.

### Checklist

1. **Point the CLI at a local DB that is up to date.** The migration CLI uses whatever DB is active in `.env`, so switch to local first ([2.1](#21-local-use-local-postgres)), then:
   ```bash
   npm run migration:run      # bring local DB up to date first
   ```
2. **Edit or create the entity.**
   - New entity: create `*.entity.ts`, extend `AuditableEntity`, and add it to `TypeOrmModule.forFeature([...])` in its module.
   - New column on a table that already has data: make it `nullable: true` **or** give it a `default`. Otherwise the migration fails on existing rows.
   - New relation: add `@ManyToOne` + `@JoinColumn({ name: 'x_id' })` + an explicit `@Column({ name: 'x_id', type: 'uuid' })` + `@Index`.
3. **Generate the migration** with a descriptive name:
   ```bash
   npm run typeorm -- migration:generate src/migrations/AddProjectsTable -d src/config/typeorm.config.ts
   ```
   (`npm run migration:generate` also works, but names every file `…-migration.ts`.)
4. **Review the generated SQL** in `src/migrations/<timestamp>-AddProjectsTable.ts`:
   - **Renames appear as DROP + ADD, which loses data.** Rewrite them as `ALTER TABLE … RENAME COLUMN a TO b`.
   - Type changes that TypeORM does as DROP + ADD: rewrite them as `ALTER COLUMN … TYPE … USING …`.
   - Make sure there are no unrelated changes. Extra statements usually mean your local DB is out of sync.
   - To make an existing column `NOT NULL`, split it into three steps: add it nullable, backfill with `UPDATE`, then `SET NOT NULL`.
   - Check that the `down()` method exactly reverses `up()`.
5. **Apply and test:**
   ```bash
   npm run migration:run
   npm run migration:revert   # optional: check that down() works
   npm run migration:run
   npm run start:dev
   ```
6. **Update everything that depends on the shape:**
   - Create, Update and Query DTOs (validators and `SORT_FIELDS`)
   - Service `select([...])` lists. Explicit selects **won't** include new columns automatically.
   - Cache: the payload shape changed, so cached entries are stale. Run `delPattern('<feature>:*')` or wait for the TTL to expire.
   - Seed data in `src/data/*` and [seed.ts](../src/database/seed.ts), if the entity is seeded.
   - Unit tests (`*.spec.ts`) and frontend types.
7. **Commit the entity and the migration together.**
8. **Deploy:** run `npm run migration:run` against production before or with the release.

### Useful commands

| Command | What it does |
|---|---|
| `npm run migration:generate` | Diffs entities against the DB and writes a migration |
| `npm run typeorm -- migration:create src/migrations/Name` | Empty migration, for data fixes or hand-written SQL |
| `npm run migration:run` | Applies pending migrations (tracked in the `migrations_history` table) |
| `npm run migration:revert` | Rolls back the **last** migration |
| `npm run schema:drop` | ⚠️ Drops every table |

---

## 7. Other how-tos

### 7.1 Background jobs with BullMQ

Use a queue for slow, retryable or rate-limited work. BullMQ uses the Redis connection from `BullModule.forRootAsync` in `app.module.ts`.

> Read [8.2](#82-bullmq-trigger-driven-never-polling) first. Jobs must be **trigger-driven** (enqueued when something happens, or delayed until a known time), never polling on a timer.

1. Define the queue name as a constant: `export const PROJECT_REPORT_QUEUE = 'project-report-queue';`
2. Register the queue in the feature module:
   ```ts
   BullModule.registerQueue({
     name: PROJECT_REPORT_QUEUE,
     defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200 },
   }),
   ```
3. Add a job:
   ```ts
   constructor(@InjectQueue(PROJECT_REPORT_QUEUE) private readonly queue: Queue) {}
   await this.queue.add('generate', { projectId }, { jobId: `report:${projectId}` }); // jobId dedupes
   ```
4. Process jobs:
   ```ts
   @Processor(PROJECT_REPORT_QUEUE, { concurrency: 2 })
   export class ProjectReportConsumer extends WorkerHost {
     async process(job: Job<{ projectId: string }>) { /* throw to trigger a retry */ }
   }
   ```
   Add the consumer to the module's `providers`.

Reference: [cv-screening.module.ts](../src/ats/cv-screening.module.ts) and [cv-screening.consumer.ts](../src/ats/cv-screening.consumer.ts).

### 7.2 Cron jobs

`ScheduleModule.forRoot()` is already registered. Create an `@Injectable()` class, add a method with `@Cron(CronExpression.EVERY_DAY_AT_2AM)` (or `@Cron('0 */15 * * * *')`), and register the class as a provider. Examples: [cleanup-tasks.service.ts](../src/cron/cleanup-tasks.service.ts), [ticket-sla.scheduler.ts](../src/tickets/ticket-sla.scheduler.ts), [cv-retention.cron.ts](../src/ats/cv-retention.cron.ts).
- Use crons only for calendar-based housekeeping. If the cron would just "look for pending work", use a triggered or delayed BullMQ job instead ([8.2](#82-bullmq-trigger-driven-never-polling)).
- Crons run on **every** instance. If you scale to more than one instance, guard the job with a Redis lock (`SET key 1 NX EX 60`).
- To add a table to the 30-day recycle-bin purge, add its repository to `CleanupTasksService`. Only do this for tables where hard deletes are safe.

### 7.3 Audit logging

`AuditInterceptor` is registered **globally** by `AuditLogModule`. To log a route, add `@AuditAction`:
```ts
@Patch(':id')
@AuditAction({
  actionType: AuditActionType.UPDATE,
  actionLabel: 'Cập nhật dự án',
  resourceSlug: 'project',
  resourceLabel: 'Dự án',
  targetEntityIdParam: 'id',
})
```
Because the interceptor is already global, adding `@UseInterceptors(AuditInterceptor)` on the controller as well can make it run twice. To write a log manually from a service, inject `AuditLogService`.

### 7.4 Response format, DTO validation and pagination

- Every successful response is wrapped by `TransformInterceptor` as `{ data, meta: { success, status_code, message, pagination? } }`.
  - Return a plain value, and it becomes `data`.
  - Return `{ data, meta, message }`: `meta` becomes `meta.pagination` and `message` is passed through.
- Errors are formatted by `GlobalExceptionFilter`. Throw Nest exceptions (`NotFoundException`, `ConflictException`, and so on) and use messages from [messages.constant.ts](../src/common/constants/messages.constant.ts).
- Pagination: extend `BaseQueryDto` and return `PaginationMetaDto.create(page, limit, total)`. Cap `limit` at 100.
- For list endpoints, use `leftJoin` with an explicit `.select([...])` instead of `leftJoinAndSelect`, so you don't leak password hashes or return oversized payloads.

### 7.5 Adding a new environment variable

1. Add it to `.env`, and add a **placeholder** (never the real value) to `.env.example`.
2. Declare it in [env.validation.ts](../src/config/env.validation.ts). Use `@IsOptional()` unless the app truly cannot start without it.
3. Read it with `configService.get<string>('MY_VAR')`. Don't use `process.env` inside Nest providers.
4. Add it to the hosting provider's environment settings before you deploy.

### 7.6 Seeding data

| Command | Effect | Safe on production? |
|---|---|---|
| `npm run seed` | **Flushes the entire Redis DB**, **drops the `public` schema**, rebuilds it from entities with `synchronize`, then seeds resources, permissions, roles, departments and users from `src/data/*` | ❌ **Never** |
| `npm run db:reset` | `schema:drop` + `migration:run` + `seed` | ❌ **Never** |
| `npm run seed:ats` | Loads ATS demo data from `src/data/ats.json`, checking for existing candidates and applications | ⚠️ Only if you want demo data there |

After `npm run seed`, the schema was created by `synchronize`, not by migrations, so the `migrations_history` table is empty. On a freshly seeded local DB, `migration:run` then tries to replay old migrations. If you need migration history locally, prefer `schema:drop` → `migration:run` and seed only data.

### 7.7 Deployment checklist

1. Code switches are set to deployment mode ([section 4](#4-environment-switch-cheat-sheet)).
2. `npm run lint && npm run build` succeeds.
3. The host has all required env vars: `NODE_ENV=production`, `DATABASE_*` (ipv4 pooler), `REDIS_URL` (`rediss://`), `REDIS_TLS=true`, `JWT_*`, `MAIL_*`, `ALLOWED_ORIGINS` (real frontend domains), `DATA_ENCRYPTION_KEY` and the AI/S3 keys.
4. Migrations have been run against production.
5. Port: [main.ts](../src/main.ts) listens on a **hard-coded `5000`** (it ignores `PORT`), while the [Dockerfile](../Dockerfile) `EXPOSE`s `3000`. Map the container port to 5000, or change `main.ts` to `app.listen(process.env.PORT ?? 5000)`.
6. Puppeteer (publishing automation) needs Chromium in the image. Uncomment the Chromium lines in the Dockerfile if you use that feature.
7. The WebSocket gateway allows `cors: { origin: '*' }`. Restrict it to your frontend domain for production.

### 7.8 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Environment validation failed` on start | A required var is missing (often `REDIS_URL`, `REDIS_TLS` or `DATABASE_*`) because its block is commented out |
| `ENETUNREACH` / `connect ETIMEDOUT` to Supabase | You are using the IPv6-only direct host from an IPv4 network. Use the pooler host |
| `password authentication failed` (Supabase) | The password isn't URL-encoded, or the pooler username is missing `.project-ref` |
| Connects to the wrong DB | `DATABASE_URL` is still set and overrides the host fields |
| `Duplicate identifier` / `Cannot redeclare` after switching | Both code variants are uncommented in `typeorm.config.ts` or `cache.module.ts` |
| BullMQ: `maxRetriesPerRequest must be null` | Use the provided `BullModule` block. It sets `maxRetriesPerRequest: null` |
| `@Cacheable() requires 'cacheService'` | The service doesn't inject `readonly cacheService: CacheService` |
| New permission doesn't take effect | The `auth:snapshot:<userId>` cache has a 10-minute TTL. Log in again or `del` the key |
| `403 Missing required permissions` for an "any" user | The guard matches exact strings. Add the `:any` variant to `@RequireAnyPermissions` |
| Event listener never fires | The listener class isn't in any module's `providers`, or the event name is misspelled |
| Generated migration contains unrelated changes | The local DB isn't in sync. Run `migration:run` first, or reset the local DB |

---

## 8. Bonus: warnings and best practices

### 8.1 ⚠️ Known warnings in the current codebase

These are problems in the code **today**. Fix them, or at least keep them in mind.

| # | Where | Risk | What to do |
|---|---|---|---|
| W1 | `.env.example` (tracked by git) | Contains real passwords, API keys, AWS keys and tokens. Once committed, they sit in git history permanently | Replace with placeholders and rotate every key that was ever pushed or shared |
| W2 | `npm run seed` / `db:reset` | Runs `FLUSHDB` on Redis and `DROP SCHEMA public CASCADE` on whatever DB `.env` points at | Run only against local. Consider adding a guard that refuses when `NODE_ENV=production` or the host contains `supabase.com` |
| W3 | [job-board-webhook.guard.ts](../src/ats/guards/job-board-webhook.guard.ts) | Reads the secret from the **query string**, which ends up in logs and proxies. Compares with `!==`, which isn't constant-time. **Allows everything** if `TOPCV_WEBHOOK_SECRET` is unset | Use a header or HMAC signature with `timingSafeEqual`, and fail closed in production ([8.5](#85-receiving-webhooks)) |
| W4 | [ticket-sla.scheduler.ts](../src/tickets/ticket-sla.scheduler.ts) (`EVERY_10_MINUTES`) and [cv-retention.cron.ts](../src/ats/cv-retention.cron.ts) (`*/15 * * * *`) | Poll the DB on a timer even when there is nothing to do, and run on **every** instance | Convert to trigger-driven delayed jobs ([8.2](#82-bullmq-trigger-driven-never-polling)) |
| W5 | Every `@Processor` except `CvScreeningConsumer` | BullMQ defaults (`drainDelay` 5 s, `stalledInterval` 30 s) send Redis commands all day, even when idle. This is costly on Upstash | Apply the idle-friendly worker options from [8.2](#82-bullmq-trigger-driven-never-polling) |
| W6 | `job-posts.service.ts` → `publishQueue.add('publish-job', …)` | No `jobId`, so rescheduling a post adds a **second** job, and it is published twice | Always pass a deterministic `jobId`, and remove the old delayed job when rescheduling |
| W7 | `ticket.service.ts` → `generateUniqueTicketCode` | 2 random bytes = 65 536 codes per department per year. Collisions become likely after a few hundred tickets | Retry on unique violation (`23505`) or use a Postgres sequence ([8.6](#86-data-integrity-transactions-concurrency-money-time)) |
| W8 | Codebase-wide | Only one use of transactions or locks. Multi-table writes can leave partial data | Wrap multi-step writes in a transaction ([8.6](#86-data-integrity-transactions-concurrency-money-time)) |
| W9 | [main.ts](../src/main.ts) | No `app.enableShutdownHooks()`. On deploy or restart, in-flight BullMQ jobs and DB connections are cut off | Add `app.enableShutdownHooks()` before `listen` |
| W10 | `NotificationsGateway` + in-memory `EventEmitter2` | Neither works across instances ([8.8](#88-running-more-than-one-instance)) | Stay single-instance, or add the Socket.IO Redis adapter and move cross-instance work to BullMQ |
| W11 | `NotificationsGateway` `cors: { origin: '*' }`, `CacheController` without guards | Open WebSocket origin, and an unguarded cache-flush endpoint if someone registers the controller | Restrict the origin to `ALLOWED_ORIGINS`, and add `JwtAuthGuard` + `PermissionsGuard` to `CacheController` |
| W12 | `PermissionsGuard` bypass list | Hard-coded `EXEC_CEO` slug, but the roles matrix uses `EXEC_DIRECTOR` | Keep the bypass on `*:*:any` only, and remove the hard-coded role slugs |

### 8.2 BullMQ: trigger-driven, never polling

**Principle:** a queue job is created **only when something happens**, such as a user action, a webhook or a domain event. Nothing should wake up every N minutes to *look for* work. Polling wastes DB reads and Redis commands, and on Upstash you pay for every command.

#### ❌ Don't

- `@Cron('*/5 * * * *')` that runs `SELECT … WHERE status = 'PENDING'` to find work.
- Repeatable jobs: `queue.add(name, data, { repeat: { every: 60_000 } })` or `upsertJobScheduler(...)` for anything that could be event-driven.
- Adding a job and *also* having a cron that picks up the same records, which processes them twice.
- Putting large payloads (file buffers, full entities, AI responses) into job data. Redis keeps them in memory.
- `removeOnComplete: false` (the default keeps every finished job in Redis forever).

#### ✅ Do

**1. Enqueue at the moment of the trigger.**

```ts
// service, after the DB write succeeds
const saved = await this.repo.save(entity);
await this.queue.add('process', { id: saved.id }, { jobId: `process:${saved.id}` });
```

**2. Anything time-based becomes a delayed job**, scheduled when the deadline becomes known. This replaces polling crons.

```ts
// When a ticket is created or its SLA changes: schedule ONE check at the deadline
await this.slaQueue.add(
  'sla-check',
  { ticketId: ticket.id },
  {
    jobId: `sla:${ticket.id}`,                                        // one per ticket, dedupes
    delay: Math.max(0, ticket.resolutionDueAt.getTime() - Date.now()),
    removeOnComplete: true,
    removeOnFail: 100,
  },
);

// When the ticket is resolved or rescheduled: cancel the old job
await (await this.slaQueue.getJob(`sla:${ticket.id}`))?.remove();
```

In the processor, **re-read the row** and exit if it's no longer relevant (for example, already resolved). The job only says "check now", while the DB remains the source of truth.

The same pattern fixes the CV S3 upload retry: when an upload fails, enqueue `retry-upload` with `attempts: 5, backoff: { type: 'exponential', delay: 60_000 }` instead of scanning every 15 minutes.

**3. Configure workers to stay quiet when idle.** Use this on every `@Processor`, following the pattern in [cv-screening.consumer.ts](../src/ats/cv-screening.consumer.ts):

```ts
@Processor(MY_QUEUE, {
  concurrency: 2,           // how many jobs run in parallel on this instance
  drainDelay: 30,           // seconds a blocking wait lasts when the queue is empty (default 5)
  stalledInterval: 300_000, // stalled-job check every 5 min (default 30 s)
  maxStalledCount: 1,
})
```

**4. Always set job options.**

| Option | Why |
|---|---|
| `jobId` (deterministic) | Idempotency: adding the same trigger twice doesn't create two jobs |
| `attempts` + `backoff: { type: 'exponential' }` | Handles temporary third-party failures |
| `removeOnComplete: 100` / `removeOnFail: 200` | Keeps Redis memory bounded |
| `delay` | Time-based work without polling |

**5. Make processors idempotent.** A job can run more than once (retry, stalled recovery). Check the state first (`if (row.status !== 'PENDING') return;`) and use upserts or unique constraints.

**6. Throw to retry, return to finish.** Throwing marks the attempt failed and schedules a retry. For permanent errors (for example validation), use `throw new UnrecoverableError(msg)` from `bullmq` so it doesn't retry.

**When is a cron still OK?** For truly calendar-based housekeeping that has no triggering event: nightly cleanup, retention purges, daily reports. Run it off-peak (`EVERY_DAY_AT_2AM`), process in batches, and protect it with a Redis lock if more than one instance exists ([8.8](#88-running-more-than-one-instance)).

**Cache vs. queue load:** cache keys, sessions, the rate limiter and BullMQ all share one Redis. Keep cache TTLs finite, never `KEYS *` in app code (use `delPattern`, which uses SCAN), and keep job payloads under about 1 KB (ids only, as `cv-upload-queue` already does).

### 8.3 Non-blocking I/O inside the app

Node runs your code on **one thread**. Anything synchronous or CPU-heavy freezes **every** request, WebSocket and worker on that instance.

| ❌ Blocking | ✅ Non-blocking alternative |
|---|---|
| `fs.readFileSync`, `writeFileSync`, `existsSync` in request or worker code | `fs/promises` (`await readFile(...)`), or streams for large files |
| `bcrypt.hashSync` / `compareSync` | `await bcrypt.hash()` / `await bcrypt.compare()` |
| `crypto.scryptSync` / `pbkdf2Sync` per request | Derive once and cache it (as `CryptoUtil` does), or use the async `scrypt` |
| `execSync`, `child_process.spawnSync` | `spawn` / `execFile` with promises |
| Parsing big PDF/DOCX or AI post-processing in the HTTP request | Queue it in BullMQ and answer `202 Accepted` with a tracking id |
| `JSON.parse` / `stringify` of multi-MB payloads | Paginate, select fewer columns, stream |
| Holding whole uploads in memory (`memoryStorage`) | Keep `limits.fileSize` strict, stream to S3 (`@aws-sdk/lib-storage` `Upload`) |
| `for (…) { await repo.save(x) }` over many rows | One bulk `save([...], { chunk: 100 })`, or `insert` / `update … WHERE id IN (...)` |
| `await` inside loops calling external services | `Promise.all` with a **concurrency limit** (below) |

**Parallel work with a limit.** Unlimited `Promise.all` over 1 000 items opens 1 000 sockets or DB connections at once. Instead:

```ts
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}
```

**Independent awaits in parallel:**

```ts
// ❌ sequential: 3 round-trips
const a = await repoA.count(); const b = await repoB.count(); const c = await repoC.count();
// ✅ parallel: 1 round-trip time
const [a, b, c] = await Promise.all([repoA.count(), repoB.count(), repoC.count()]);
```

(Don't do this inside a single transaction's `EntityManager`, because one connection runs queries one at a time anyway.)

**Fire-and-forget safely.** If you intentionally don't await something, attach a `.catch`, or an unhandled rejection can crash the process:

```ts
void this.mailService.sendX(...).catch((e) => this.logger.warn(`mail failed: ${e.message}`));
```

For anything that matters, prefer an event or a queue job over fire-and-forget.

**Puppeteer (publishing automation)** is very heavy on CPU and RAM. Keep it inside BullMQ with `concurrency: 1`, always `browser.close()` / `page.close()` in `finally`, and never launch a browser inside an HTTP request.

### 8.4 Calling third-party APIs

Applies to Gemini, Claude, TopCV, CareerViet, Facebook, Zalo, Resend/SMTP, S3 and so on.

1. **Always set a timeout.** Without one, a request can hang forever and hold a worker slot.
   ```ts
   await fetch(url, { signal: AbortSignal.timeout(15_000) });                // fetch
   await this.http.axiosRef.get(url, { timeout: 15_000 });                   // axios
   ```
2. **Don't call slow or unreliable APIs in the HTTP request path.** Save the intent in the DB, enqueue a job, return `202` with an id, and push the result with an event or WebSocket (section 5.5).
3. **Retry only what is retryable**: network errors, `408`, `429`, `5xx`. Never retry `400`, `401`, `403` or `422`, because those need a fix, not a retry. Use BullMQ `attempts` + exponential `backoff`, and respect the `Retry-After` header on `429`.
4. **Idempotency on the way out.** If the provider supports an idempotency key, send one derived from your record id, so a retry doesn't create duplicate posts, emails or charges.
5. **Rate limits and quotas.** Throttle at the queue level: set worker `concurrency` and `limiter: { max: 10, duration: 1000 }` in `@Processor` options. Spread load across keys only where that's allowed (see `gemini-key-pool.ts`).
6. **Validate responses.** Treat external JSON as `unknown`, then validate it (class-validator DTO or type guards) before saving. AI output in particular must be parsed defensively.
7. **Circuit breaking.** If a provider fails repeatedly, stop sending for a while (for example, set a Redis flag `provider:down` with a TTL) instead of burning retries and quota.
8. **Secrets.** Read keys from `ConfigService`, never log request headers or bodies that contain tokens, and redact personal data before sending it to AI providers where possible.
9. **Log the essentials**: provider, endpoint, status, duration and your correlation id. Don't log full payloads.

### 8.5 Receiving webhooks

Webhooks (for example TopCV) are **untrusted input from the internet**, and providers retry them.

1. **Authenticate every request. Fail closed.**
   - Prefer an HMAC signature header. Compute `HMAC-SHA256(rawBody, secret)` and compare with `crypto.timingSafeEqual`, not `===`.
   - If the provider only supports a shared secret, send it in a **header**, not the query string.
   - If the secret env var is missing in production, **reject** everything instead of allowing everything.
   - HMAC needs the **raw body**: create the app with `NestFactory.create(AppModule, { rawBody: true })` and read `req.rawBody`.
2. **Reject replays** when the provider sends a timestamp: refuse anything older than about 5 minutes.
3. **Deduplicate.** Providers retry, so store the provider's event id with a unique index (or `SET webhook:<provider>:<eventId> 1 NX EX 604800` in Redis) and return `200` for duplicates without processing them again.
4. **Acknowledge fast, process later.** Validate the DTO, save the raw event or enqueue a job, and return `200` within a few seconds. Do the heavy work (download CV, parse, AI scoring) in a BullMQ worker. Slow responses cause provider timeouts and retry storms.
5. **Validate the payload** with a DTO (`topcv-webhook.dto.ts`). Never trust ids or URLs in it: re-fetch from the provider's API when possible, and only download files from allow-listed hosts.
6. **Exclude webhooks from JWT guards, but not from rate limiting.** Give them their own throttle limits.
7. **Store what you received** (sanitized) for debugging and audit.

**Outgoing webhooks** (if this ERP ever notifies other systems): sign them with HMAC, include a timestamp and a unique event id, send them from a BullMQ job with retries and backoff, and expect receivers to be slow or down.

### 8.6 Data integrity: transactions, concurrency, money, time

**Transactions.** Any operation that writes to more than one table, or reads and then writes based on what it read, must be atomic:

```ts
await this.dataSource.transaction(async (manager) => {
  const request = await manager.findOneOrFail(RecruitmentRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
  request.status = 'APPROVED';
  await manager.save(request);
  await manager.save(manager.create(JobPost, { ... }));
});
// emit events / enqueue jobs AFTER the transaction resolves
this.eventEmitter.emit('recruitment.request.approved', ...);
```

- Use the `manager` passed in for **every** query inside the transaction. Using `this.repo` runs the query outside the transaction.
- Keep transactions short: no HTTP calls, AI calls or file uploads inside them.
- Emitting events or enqueueing jobs *inside* a transaction that later rolls back produces side effects for data that doesn't exist.

**Concurrency** (two managers approve at the same time, double-clicks, retries):
- **Approvals and state machines:** use a conditional update and check `affected`:
  ```ts
  const res = await repo.update({ id, status: 'PENDING' }, { status: 'APPROVED', updatedBy: user.id });
  if (!res.affected) throw new ConflictException('Yêu cầu đã được xử lý bởi người khác.');
  ```
- **Edit forms:** optimistic locking. Add `@VersionColumn() version!: number;` and reject stale versions.
- **Sequential codes** (ticket, contract, invoice numbers): use a Postgres `SEQUENCE` or a counter row locked with `pessimistic_write`. Never use `COUNT(*) + 1` or short random suffixes. Always keep a `unique` index as the final safety net.
- **Idempotent POSTs:** for critical creates (payments, payroll runs, publishing), accept an `Idempotency-Key` header and store it with a unique index.

**Money and quantities:**
- Use `numeric(18,2)` (or `numeric(18,0)` for VND) columns. **Never `float` or `double`**.
- TypeORM returns `numeric` as a **string**. Convert deliberately, and do arithmetic in integer units (đồng) or with a decimal library.
- Salary is stored encrypted (`*_encrypted` text), so it can't be summed or sorted in SQL. Plan reports accordingly.

**Time:**
- Store `timestamptz` (as `AuditableEntity` does), keep the server in UTC, and convert to `Asia/Ho_Chi_Minh` only for display or business rules such as "end of working day".
- Date-only business values (effective date, date of birth) use `type: 'date'`, which comes back as a `'YYYY-MM-DD'` string. Don't wrap them in `new Date()` without a timezone.
- Crons run in server time. Pass `{ timeZone: 'Asia/Ho_Chi_Minh' }` when the local hour matters.
- SLA and deadline calculations should account for working hours and holidays if the business says so.

**Soft delete:**
- `find*` automatically excludes soft-deleted rows, but **raw SQL and `manager.query` do not**. Add `deleted_at IS NULL` yourself.
- Unique business keys (code, email) should be **partial unique indexes** `WHERE deleted_at IS NULL`, or a deleted record blocks re-creating it.
- Restoring a record must re-check uniqueness.

### 8.7 Security and personal data

- **Personal data in this ERP:** CCCD (citizen ID), salary, bank accounts, phone, address, CVs. Encrypt sensitive columns (`CryptoUtil`), exclude them from default selects, never cache them un-scoped, never log them, and restrict them with `:own` / `:dept` scopes.
- **Every endpoint needs a decision:** public, logged-in, or permission-guarded. Default to `@UseGuards(JwtAuthGuard, PermissionsGuard)` plus a permission decorator.
- **IDOR:** a valid permission doesn't mean access to *this* record. For `:dept` and `:own`, load the row and check its `departmentId` or `createdBy` before update, delete or read.
- **Mass assignment:** never `repo.save({ ...req.body })`. Build entities from validated DTO fields only, so clients can't set `status`, `createdBy`, `roleId` and similar fields. `whitelist: true` helps, but DTOs must not expose privileged fields.
- **SQL:** always use parameters (`:param`) in query builders. For dynamic `ORDER BY`, whitelist columns (`SORT_FIELDS`) as the departments module does. Never interpolate user input.
- **File uploads:** check size, MIME type **and** extension, generate your own file names/keys, store in private S3, and serve through short-lived signed URLs.
- **Error responses:** don't leak stack traces or SQL errors in production (`GlobalExceptionFilter`).
- **Rotate** JWT secrets and keys if they leak. Access tokens are short-lived, and sessions are revocable through the Redis `session:*` keys.
- **Dependencies:** run `npm audit` regularly, and pin versions in production builds (`npm ci` with a committed lockfile).

### 8.8 Running more than one instance

Today the app assumes **one instance**. Before scaling horizontally (more than one container, or a PM2 cluster):

| Component | Problem with more than one instance | Fix |
|---|---|---|
| `@Cron` jobs | Run on **every** instance, so the work is duplicated | Redis lock (`SET cron:<name> <id> NX EX <ttl>`), or convert to BullMQ delayed or repeatable jobs (BullMQ runs each once) |
| `EventEmitter2` | Events stay inside the instance that emitted them | Fine for same-request side effects. Use BullMQ for anything that must survive a restart or run elsewhere |
| Socket.IO rooms | A user connected to instance A doesn't receive a push emitted on instance B | `@socket.io/redis-adapter` on the gateway |
| In-memory state (Maps, caches in services) | Differs per instance | Move it to Redis |
| DB pool (`max: 15` per instance) | Instances × 15 can exceed the Supabase pooler limit | Lower `max`, or use the transaction pooler (port 6543) |
| BullMQ workers | ✅ Safe: jobs are distributed | Size `concurrency` per instance |

### 8.9 Performance and cost guardrails

- **Always paginate** (`limit` ≤ 100). No endpoint should return an unbounded list.
- **Avoid N+1 queries:** don't query inside a `for` loop over rows. Use a join or `WHERE id IN (...)`, then map in memory.
- **Select only what you need.** Explicit `.select([...])` keeps payloads and cache entries small and avoids leaking columns.
- **Count queries are expensive** on big tables. Consider cursor pagination (`cursor` in `PaginationQueryDto`) for feeds and notifications.
- **Check query plans** for new hot queries: `EXPLAIN ANALYZE` in Supabase's SQL editor, and make sure an index is used (section 5.3).
- **Cache hot, rarely changing reads** (enums, trees, lookups) with long TTLs. Don't cache fast-changing or per-user data unless the key is scoped.
- **Watch Upstash and Supabase usage dashboards** after each release: Redis command count, DB connections, egress.
- **Logs:** use `Logger`, not `console.log`, at the right level. Keep `logging` off in production TypeORM (it's already tied to `NODE_ENV=development`).
- **Health endpoint:** expose a lightweight `GET /api/v1/health` that pings the DB and Redis, for the host's health checks.

### 8.10 Pre-merge checklist

- [ ] `npm run lint` and `npm run build` pass. New logic has at least a unit test.
- [ ] Config switches are in the agreed state ([section 4](#4-environment-switch-cheat-sheet)). No secrets in the diff.
- [ ] Entity changes have a reviewed migration committed alongside them.
- [ ] Every new route has guards and permission decorators, and services enforce scope (`any` / `dept` / `own`).
- [ ] Every write invalidates the related cache keys.
- [ ] Multi-table writes run in a transaction. Events and jobs are emitted after commit.
- [ ] No new polling cron. Background work is trigger-driven with `jobId`, `attempts`, `backoff` and `removeOnComplete`.
- [ ] Every external call has a timeout and is off the request path if it's slow.
- [ ] Webhooks authenticate (fail closed), deduplicate and acknowledge quickly.
- [ ] No sync I/O or CPU-heavy work in request handlers.
- [ ] No personal data in logs, cache keys or error messages.
