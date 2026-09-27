# AI Prompts: Chinh Nam ERP API

Ready-to-paste prompts for Claude Code (or any coding assistant opened at the repo root), one for each section of [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

**How to use:** copy a prompt and replace every `<PLACEHOLDER>`. Each prompt tells the assistant to read the guide first, so it follows this repo's conventions and not generic NestJS ones.

> Never paste real secrets (DB passwords, API keys, Redis URLs) into a prompt. Say "the values are already in my .env" instead.

---

## Environment switching

### P1. DB: local Postgres (local)

```text
Switch this project to use my LOCAL PostgreSQL database.
Follow docs/DEVELOPER_GUIDE.md section 2.1 exactly:
1. In src/config/typeorm.config.ts, un-comment the "local - postgreSQL" block and comment out the entire "online - Supabase" block. Make sure only ONE typeOrmConfigFactory and ONE default export remain active.
2. In .env, un-comment the "START - Local DB" block and comment out EVERY Supabase DATABASE_* line, including DATABASE_URL.
3. Don't change any other file, and don't print secret values in your reply.
4. Run `npx tsc --noEmit -p tsconfig.json` to confirm it compiles, then show me a short diff summary (file + which block is active).
```

### P2. DB: Supabase (local development)

```text
Switch this project to use SUPABASE while I develop locally.
Follow docs/DEVELOPER_GUIDE.md section 2.2 exactly:
1. In src/config/typeorm.config.ts, make sure the "online - Supabase" block is active and the "local - postgreSQL" block is fully commented out.
2. In .env, comment out the "Local DB" block. In the Supabase section, UN-COMMENT the "ipv6 for local" block and COMMENT OUT the "ipv4 for deployment" block. Make sure each DATABASE_* key is active exactly once.
3. Replace any `//` comment lines in .env with `#`.
4. Don't print secret values. Tell me which DATABASE_URL host is active (hostname only), and warn me if it is the IPv6-only direct host `db.<ref>.supabase.co`.
5. Run `npx tsc --noEmit -p tsconfig.json`.
```

### P3. DB: deployment

```text
Prepare the DATABASE configuration for DEPLOYMENT (reverse of local).
Follow docs/DEVELOPER_GUIDE.md section 2.3:
1. src/config/typeorm.config.ts: the "online - Supabase" block must be active and the local block commented out.
2. In .env (for reference only), the "ipv4 for deployment" block must be active and the "ipv6 for local" and "Local DB" blocks commented out.
3. Give me the exact list of DATABASE_* variable NAMES I must set on the hosting provider, with placeholder values (no real secrets), and check that the DATABASE_URL format uses the IPv4-compatible pooler host.
4. Remind me to run `npm run migration:run` against production and NOT `npm run seed` / `db:reset`.
5. Show `git diff --stat` for the config files so I can confirm what will be committed.
```

### P4. Redis: local

```text
Switch Redis to LOCAL (docker redis on localhost:6379).
Follow docs/DEVELOPER_GUIDE.md section 3.1:
1. src/common/cache/cache.module.ts: un-comment the "local docker redis" CacheModule block and comment out the "upstash redis" block. Only one `export class CacheModule` may remain.
2. src/app.module.ts: un-comment the BullModule.forRootAsync under "local docker redis" and comment out the one under "Upstash-compatible BullMQ Connection". Only one BullModule.forRootAsync may remain in imports.
3. .env: un-comment "START - Local Redis Config" (REDIS_URL=redis://localhost:6379, REDIS_TLS=false) and comment out the Upstash block.
4. Remove any imports that become unused (e.g. Logger / RedisOptions) only if ESLint complains. Run `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app.module.ts src/common/cache/cache.module.ts`.
```

### P5. Redis: deployment (Upstash)

```text
Switch Redis to UPSTASH for DEPLOYMENT (reverse of local).
Follow docs/DEVELOPER_GUIDE.md section 3.2:
1. src/common/cache/cache.module.ts: the "upstash redis" block is active and the local block is commented out.
2. src/app.module.ts: the "Upstash-compatible BullMQ Connection" block is active and the local BullModule block is commented out.
3. .env (reference): the Upstash block is active and the local Redis block is commented out. REDIS_URL must use `rediss://` and REDIS_TLS=true. REDIS_HOST must be a bare hostname (no https://).
4. List the REDIS_* variable names I must set on the host (placeholders only).
5. Type-check, lint the two files, and show the diff summary.
```

### P6. Full environment check (use before any commit or deploy)

```text
Audit my current environment configuration against the cheat-sheet in docs/DEVELOPER_GUIDE.md section 4.
Check src/config/typeorm.config.ts, src/common/cache/cache.module.ts, src/app.module.ts (BullModule), and .env.
Report in a table: which variant is active in each place, whether any key is duplicated or double-declared, whether DATABASE_URL overrides the host fields, and which cheat-sheet row this matches (or "inconsistent").
Also check .env.example: flag any line that looks like a real secret (passwords, API keys, tokens, connection strings with credentials).
Do NOT modify anything and do NOT echo secret values.
```

---

## Feature module

### P7. Create a whole feature module

```text
Create a complete new feature module named <FEATURE> (singular entity: <Entity>, table: <table_name>, route: /api/v1/<route>).
Read docs/DEVELOPER_GUIDE.md section 5 and use src/departments/ as the reference implementation.

Entity fields:
- <field>: <type>, <nullable?>, <unique?>
- <field>: <type> ...
Relations: <e.g. ManyToOne Department via department_id, owner_id -> User>

Requirements:
1. Folder src/<feature>/ with entities/, dto/ (create, update via PartialType, query extending BaseQueryDto with a SORT_FIELDS whitelist), <feature>.service.ts, <feature>.controller.ts, <feature>.module.ts.
2. Entity extends AuditableEntity, UUID PK, snake_case column names, explicit @Index names (section 5.3) for every filter/join/sort column.
3. Service: create / findAll (paginated, search, filters, explicit .select([...]) with leftJoin) / findOne / update / soft remove (fill deletedBy/deletedByName). Fill createdBy/createdByName/updatedBy/updatedByName from the current user.
4. Caching per section 5.1 (lists + detail cached, writes invalidate).
5. Permissions per section 5.2 with resource slug `<resource_slug>`: guards on the controller, @RequireAnyPermissions listing any/dept/own for reads, scope filtering in the service with hasPermission/getUserDepartmentId. Add the resource to src/data/resources.ts and grant it in src/data/roles-matrix.ts to: <ROLE_SLUGS and scopes>.
6. Events per section 5.4: emit `<feature>.created`, `<feature>.updated`, `<feature>.deleted` (add others: <...>).
7. Notifications per section 5.5 for: <who gets notified on which event>.
8. Register the module in src/app.module.ts.
9. Generate the migration with a descriptive name (section 6), review it, and show me the SQL.
10. Run `npm run lint` and `npm run build` and fix all errors.
Finish with a list of created files and the endpoint table (method, path, required permissions).
```

### P8. Add caching to a service

```text
Add Redis caching to src/<feature>/<feature>.service.ts following docs/DEVELOPER_GUIDE.md section 5.1.
- Inject `readonly cacheService: CacheService` (exact name, not private).
- @Cacheable on: <methods>, keys `<feature>:list:<json-query>` and `<feature>:<id>` (add user/dept id to the key if the result is permission-scoped). TTL: list <3600>s, detail <86400>s. Support a bypass flag wired to `?refresh=true` in the controller.
- @CacheClear on every write method (create/update/remove/<others>), clearing the list pattern and the affected detail key(s), including the slug key if records can be fetched by slug.
- Check every call site: if code relies on Date objects from cached methods, convert safely (cached values come back as ISO strings).
- Don't change behaviour otherwise. Type-check and lint.
Then list every cache key the service now uses and which method invalidates it.
```

### P9. Add permission restriction

```text
Add RBAC permission restriction to the <FEATURE> module following docs/DEVELOPER_GUIDE.md section 5.2.
Resource slug: <resource_slug>.
Rules:
- <ROLE_SLUG>: <actions> at scope <any|dept|own>
- <ROLE_SLUG>: ...
Tasks:
1. Add the resource to src/data/resources.ts (if missing) and grant permissions in src/data/roles-matrix.ts using grant()/forDeptHead()/forStaff().
2. Controller: @UseGuards(JwtAuthGuard, PermissionsGuard); on every route put @RequirePermissions or @RequireAnyPermissions (list every acceptable scope, since the guard matches exact strings).
3. Service: filter rows by scope with hasPermission() and getUserDepartmentId() from src/common/utils/ats-rbac.util.ts (any = no filter, dept = department_id, own = owner/created_by). For update/delete, check the target row is within the user's scope and throw ForbiddenException otherwise.
4. If caching is used, make cache keys scope-aware.
5. Tell me the exact API calls (POST /api/v1/resources, POST /api/v1/permissions, PATCH /api/v1/roles/:id/permissions) needed to apply this on an existing DB WITHOUT running the seed.
Output a permission matrix table (endpoint × required permissions).
```

### P10. Add or optimize entity indexes

```text
Review and optimize database indexes for src/<feature>/entities/<entity>.entity.ts following docs/DEVELOPER_GUIDE.md section 5.3.
1. Read the service(s) that query this entity and list every WHERE / JOIN / ORDER BY pattern.
2. Propose indexes: explicit names idx_<table>_<cols>, equality columns first then sort/range, partial indexes (`where:` uses DB column names) for soft-delete or status filters, unique partial indexes where a business rule needs uniqueness among non-deleted rows. Point out redundant indexes (e.g. duplicated by unique columns or a composite prefix).
3. Show me the proposal as a table (index, columns, query it serves) BEFORE editing.
4. After I confirm, update the entity, generate a migration named `Index<Entity>` and confirm it only contains the expected CREATE/DROP INDEX statements.
```

### P11. Add domain events

```text
Add domain events to the <FEATURE> module following docs/DEVELOPER_GUIDE.md section 5.4.
Events to add:
- `<feature>.<action>` fired when <condition>, payload: <fields>
- ...
Tasks:
1. Create src/<feature>/<feature>.events.ts with one class per event (readonly constructor params, ids and snapshot strings only, no entities).
2. Inject EventEmitter2 in the service and emit each event right AFTER the successful save/commit.
3. Create src/<feature>/<feature>-events.listener.ts with @OnEvent('<name>', { async: true }) handlers that do: <side effects>. Wrap every handler in try/catch with Logger.
4. Register the listener in the module providers.
5. If a side effect is slow or must be retried (<which ones>), enqueue a BullMQ job from the listener instead (section 7.1).
List the event names, emit locations (file:line) and listeners.
```

### P12. Add push (real-time in-app) notifications

```text
Add real-time in-app notifications for the <FEATURE> module following docs/DEVELOPER_GUIDE.md section 5.5 and the pattern in src/publishing-automation/publishing-automation-notifications.listener.ts.
Notifications:
- On event `<event.name>` → notify <recipients: e.g. owner / dept head of target department / all HR roles>, category <TASK|APPROVAL|SYSTEM|ALERT|ANNOUNCEMENT>, priority <LOW|NORMAL|HIGH|URGENT>, taskType `<UPPER_SNAKE>`, title "<vi title>", body "<vi body>", actionUrl `/<fe-route>/<id>`.
- ...
Tasks:
1. If the events don't exist yet, create them first (section 5.4).
2. Create src/<feature>/<feature>-notifications.listener.ts: resolve recipients, exclude the actor, bulk create + save Notification rows, then gateway.pushToUser() for each saved row. Use try/catch + Logger.
3. Import NotificationsModule and add Notification + User to TypeOrmModule.forFeature in the feature module. Register the listener.
4. If the UI should refresh a list, also call gateway.emitSystemEventToUser(userId, '<invalidate_event>', { id }).
5. Document the socket events the frontend must listen to.
```

### P13. Create or update an entity (migration workflow)

```text
I need to <create a new entity <Entity> | change entity src/<path>.entity.ts>: <describe the change: add column X (type, nullable/default), rename Y to Z, add relation to W, drop column V ...>.
Follow docs/DEVELOPER_GUIDE.md section 6 step by step:
1. First confirm .env / typeorm.config.ts point at my LOCAL database (section 2.1). If not, stop and tell me.
2. Run `npm run migration:run` so the local DB is current.
3. Edit the entity (new columns on tables with data must be nullable or have a default; relations need explicit FK column + @Index).
4. Generate the migration: `npm run typeorm -- migration:generate src/migrations/<DescriptiveName> -d src/config/typeorm.config.ts`.
5. Review the SQL: rewrite renames as RENAME COLUMN, type changes as ALTER COLUMN ... USING, split NOT NULL additions into add-nullable / backfill / set-not-null, verify down() reverses up(), and remove unrelated statements (tell me if you find any).
6. Run migration:run, migration:revert, migration:run.
7. Update DTOs, SORT_FIELDS, service .select([...]) lists, cache invalidation, seed data and specs that depend on the changed shape.
8. `npm run lint` and `npm run build`.
Show me the final migration SQL and the list of dependent files you updated.
```

---

## Other how-tos

### P14. Add a BullMQ background job

```text
Add a BullMQ background job to the <FEATURE> module following docs/DEVELOPER_GUIDE.md section 7.1 (reference: src/ats/cv-screening.module.ts and cv-screening.consumer.ts).
Queue name constant: <FEATURE>_<JOB>_QUEUE = '<kebab-name>-queue'. Job name: '<job>'. Payload: <fields>.
Work to do in the processor: <description>. Concurrency: <n>. Retries: attempts <3> with exponential backoff. Dedupe with jobId `<pattern>`.
Enqueue from: <service method or event listener>.
Register the queue and the consumer in the module, make the processor idempotent (safe to run twice), and log start/finish/failure.
```

### P15. Add a cron job

```text
Add a scheduled task to <FEATURE> following docs/DEVELOPER_GUIDE.md section 7.2.
Schedule: <CronExpression or cron string, timezone Asia/Ho_Chi_Minh if needed>. Task: <description>.
Create an @Injectable() class <Feature>Scheduler with the @Cron method, register it in the module, process records in batches, log a summary, and protect it with a Redis lock (SET NX EX) via CacheService's REDIS_CLIENT so it runs once when multiple instances are deployed.
```

### P16. Add audit logging to routes

```text
Add audit logging to src/<feature>/<feature>.controller.ts following docs/DEVELOPER_GUIDE.md section 7.3.
For each mutating route (POST/PATCH/PUT/DELETE) add @AuditAction with the right AuditActionType, a Vietnamese actionLabel, resourceSlug '<resource_slug>', resourceLabel '<vi label>', and targetEntityIdParam when the route has an :id param.
Don't add @UseInterceptors(AuditInterceptor) because the interceptor is already global. If the controller already has it, tell me (possible double logging) but don't remove it without asking.
```

### P17. Add a new environment variable

```text
Add a new environment variable <VAR_NAME> (<purpose>, type <string|number|boolean>, <required|optional>, default <value>) following docs/DEVELOPER_GUIDE.md section 7.5:
1. Declare it in src/config/env.validation.ts with the right validators (@IsOptional unless truly required).
2. Add a PLACEHOLDER line to .env.example (never a real value) and tell me to add the real value to .env and to the hosting provider.
3. Read it via ConfigService where needed: <file/service>.
```

### P18. Pre-deployment review

```text
Run the deployment checklist in docs/DEVELOPER_GUIDE.md section 7.7 against the current working tree and report PASS/FAIL per item:
- config switches in deployment mode (section 4),
- `npm run lint` and `npm run build` succeed,
- pending migrations exist in src/migrations that may not be applied in production (list them),
- env vars required by src/config/env.validation.ts,
- port mismatch between src/main.ts and Dockerfile,
- CORS (ALLOWED_ORIGINS) and the WebSocket gateway cors setting,
- secrets present in tracked files (.env.example, source), reported by file and key name only.
Do not change files. Give me a prioritized fix list.
```

### P19. Troubleshoot a startup or runtime error

```text
The app fails with this error:
<paste the error/stack trace, with secrets removed>
Context: I am running <npm run start:dev | migration:run | seed> with <local DB | Supabase> and <local Redis | Upstash>.
Check the troubleshooting table in docs/DEVELOPER_GUIDE.md section 7.8 first, then inspect src/config/typeorm.config.ts, src/common/cache/cache.module.ts, src/app.module.ts and the (redacted) active .env keys. Explain the root cause, then apply the smallest fix.
```

### P20. Review a feature module against project conventions

```text
Review src/<feature>/ against the conventions in docs/DEVELOPER_GUIDE.md sections 5–6 and report violations with file:line:
- entity: AuditableEntity, snake_case columns, explicit index names, FK columns indexed
- DTOs: validators on every field (whitelist strips others), sortBy whitelisted
- service: explicit selects (no password leakage), audit fields filled, soft delete, events emitted after save
- cache: keys scoped correctly, every write invalidates, no Date assumptions on cached data
- permissions: guards present, all scopes listed, service-level scope filtering, update/delete ownership checks
- listeners: registered, try/catch, no throws
- migrations: exist for every entity change
Report only. Do not edit.
```

---

## Bonus: warnings and best practices (guide section 8)

### P21. Fix the known warnings

```text
Read docs/DEVELOPER_GUIDE.md section 8.1 (known warnings W1–W12).
For each warning, verify it still exists in the code (file:line) and mark it FIXED / STILL PRESENT.
Then fix ONLY these items: <W3, W6, W7, W9 ... pick>, one commit-sized change each, following the "What to do" column and the linked subsections.
Rules: no behaviour changes beyond the fix, keep existing code style, and run `npm run lint` and `npm run build` after each fix.
For W1 (secrets in .env.example), replace values with placeholders but DO NOT print the original secret values anywhere, and give me the list of key NAMES I must rotate.
```

### P22. Convert polling crons or jobs to trigger-driven BullMQ

```text
Follow docs/DEVELOPER_GUIDE.md section 8.2 ("trigger-driven, never polling").
1. Find every @Cron / @Interval / setInterval / repeatable BullMQ job (`repeat`, `every`, `upsertJobScheduler`) in src/. For each one, classify it: (a) calendar housekeeping, so keep it; or (b) polling for work, so convert it. Show the table and wait for my confirmation.
2. For each (b) item (e.g. src/tickets/ticket-sla.scheduler.ts, the S3 retry in src/ats/cv-retention.cron.ts):
   - identify the trigger(s) that create or change the work (e.g. ticket created / SLA changed / ticket resolved, S3 upload failed),
   - enqueue a job at that moment. For deadlines, use a DELAYED job with a deterministic jobId (e.g. `sla:<ticketId>`), and remove or replace it when the deadline changes or the work is no longer needed,
   - the processor re-reads the row and exits if it's no longer relevant (idempotent), with attempts + exponential backoff and removeOnComplete/removeOnFail,
   - delete the polling cron,
   - add a one-off backfill (script or migration-time step) that enqueues jobs for rows already pending today.
3. Apply the idle-friendly worker options (drainDelay 30, stalledInterval 300000, maxStalledCount 1, explicit concurrency) to EVERY @Processor.
4. Lint, build, and summarise: removed crons, new queues/jobs, where each job is enqueued/cancelled.
```

### P23. Audit for blocking I/O

```text
Audit src/ for event-loop blocking code, following docs/DEVELOPER_GUIDE.md section 8.3.
Search for: *Sync( calls (fs, crypto, child_process, bcrypt), CPU-heavy work (PDF/DOCX parsing, big JSON, AI post-processing, puppeteer) inside HTTP handlers, `await` inside loops over DB rows or external calls, unbounded Promise.all over large arrays, repo.save inside loops, fire-and-forget promises without .catch.
Ignore seed scripts and one-time startup code.
Report a table: file:line, pattern, impact (high/med/low), proposed fix (async API / BullMQ job / bulk query / mapLimit / Promise.all).
Then fix only the items I approve.
```

### P24. Harden a third-party API integration

```text
Harden the integration with <PROVIDER: Gemini | Claude | TopCV | CareerViet | Facebook | Zalo | Resend | S3> in <file(s)> following docs/DEVELOPER_GUIDE.md section 8.4:
- every outgoing call has a timeout (AbortSignal.timeout / axios timeout),
- slow calls are moved off the HTTP request path into a BullMQ job (return 202 + tracking id, push the result via event/WebSocket),
- retries only on network/408/429/5xx with exponential backoff, and Retry-After respected; permanent errors throw UnrecoverableError,
- outgoing idempotency key where the provider supports it,
- queue-level rate limiting (worker concurrency + limiter),
- responses validated as unknown → DTO/type guard before use,
- a simple circuit breaker via a Redis flag with TTL,
- logs contain provider, endpoint, status and duration only (no tokens, no personal data).
Show the before/after flow and list config values (timeouts, limits) I can tune.
```

### P25. Secure a webhook endpoint

```text
Secure the webhook endpoint <route> (guard: <file>, controller: <file>) following docs/DEVELOPER_GUIDE.md section 8.5:
1. Authenticate with <HMAC signature header "<header-name>" | shared secret in header "<header-name>">, using crypto.timingSafeEqual. Enable rawBody in main.ts if HMAC is used. FAIL CLOSED when the secret is missing and NODE_ENV=production. Stop reading the secret from the query string (keep query support behind a flag only if the provider requires it, and tell me).
2. Reject replays older than 5 minutes if the provider sends a timestamp.
3. Deduplicate by provider event id (<field>) with Redis SET NX EX 7d or a unique index, and return 200 for duplicates.
4. Validate the payload DTO, save or enqueue, and return 200 fast. Move heavy work (file download, parsing, AI) to a BullMQ job.
5. Only download files from allow-listed hosts: <hosts>.
6. Give the route its own throttle limits.
Then give me a curl example for a valid signed request and one for a rejected request.
```

### P26. Make a write flow safe (transactions and concurrency)

```text
Make <service method(s), e.g. RecruitmentRequestService.approve> safe following docs/DEVELOPER_GUIDE.md section 8.6:
- wrap multi-table writes in dataSource.transaction and use the transactional `manager` for EVERY query inside it,
- no external calls inside the transaction; emit events / enqueue jobs only AFTER commit,
- protect state transitions with a conditional update (WHERE status = <expected>) and throw ConflictException when affected = 0, or add @VersionColumn optimistic locking for edit forms (tell me which you chose and why),
- replace any COUNT+1 or short-random code generation with a Postgres SEQUENCE (via migration) or a locked counter row, keeping a unique index,
- money columns must be numeric (not float); flag any float/double money columns you find,
- timestamps timestamptz; business dates in Asia/Ho_Chi_Minh.
Generate any required migration and describe the race condition each change prevents.
```

### P27. ERP production-readiness review

```text
Do a production-readiness review of this ERP using docs/DEVELOPER_GUIDE.md section 8 (8.1–8.10) as the checklist.
For each subsection report: status (OK / RISK / MISSING), evidence (file:line), impact, and the smallest fix.
Pay special attention to: personal data exposure (CCCD, salary, bank, CV) in selects/logs/cache/errors, IDOR on :dept/:own routes, unguarded endpoints, polling crons and idle Redis usage, blocking I/O, third-party calls without timeouts, webhook auth, missing transactions, multi-instance blockers (cron duplication, socket.io adapter, pool size), and shutdown hooks.
Output a prioritized fix list (P0/P1/P2). Do not edit files.
```
