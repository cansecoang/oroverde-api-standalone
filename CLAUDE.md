# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev           # Development watch mode (port 3000)
npm run start:debug         # Debug mode with --inspect
npm run build && npm run start:prod  # Production

npm test                    # Jest unit tests (rootDir: src, pattern: *.spec.ts)
npm run test:watch          # Watch mode
npm run test:cov            # Coverage report
npm run test:e2e            # Playwright E2E (config: test/jest-e2e.json)

# Run a single test file
npx jest src/path/to/file.spec.ts

npm run lint                # ESLint with autofix
npm run format              # Prettier
```

Swagger docs available at `http://localhost:3000/docs` when running locally.

## Architecture

### Dual-Plane Database Model

Two separate PostgreSQL databases:

- **Control Plane** (`control_plane` DB — TypeORM `default` connection): `GlobalUser`, `GlobalOrganization`, `Tenant`, `TenantMember`, `GlobalCountry`
- **App Plane** (one silo DB per tenant, named `tenant_{slug}`): all entities listed in `src/app/modules/app-plane/app-plane-entities.ts`

Before any data model work, read the SQL schemas in the parent repo:
- `../control_plane.sql` — control plane schema
- `../app_plane.sql` — app plane schema (applied to each tenant silo)

### Tenant Connection Pool

`TenantConnectionService` (`src/app/modules/tenancy/tenant-connection.service.ts`) is **REQUEST-scoped** and manages a static `Map<slug, DataSource>` with a 30-minute idle TTL. All app-plane services must call `tenantConnectionService.getTenantConnection()` to get the tenant's `DataSource` — never use the default TypeORM connection for app-plane queries.

`TenantMiddleware` extracts the `X-Tenant-ID` header (slug format: lowercase alphanumeric + hyphens, max 50 chars), validates it, and sets `req.tenantId`. Routes under `/api/auth`, `/api/admin`, `/api/health`, and `/docs` skip this header requirement.

### Guard Stack

All app-plane controllers use this exact guard chain:

```typescript
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
```

1. **`AuthenticatedGuard`** — verifies an active Passport.js session
2. **`TenantAccessGuard`** — looks up `workspace_members` for `req.user.id`; for `SUPER_ADMIN` injects a synthetic member; sets `req.workspaceMember`
3. **`HybridPermissionsGuard`** — reads `@RequirePermission(Permission.X)` decorator; checks `TenantACL` → `ProductACL`; `GENERAL_COORDINATOR` gets bypass

Control-plane (`/api/admin`) uses only `AuthenticatedGuard` + `RolesGuard(@Roles(GlobalRole.SUPER_ADMIN))`.

### Permission System

Defined in `src/app/common/enums/business-roles.enum.ts`:
- `TenantRole`: `GENERAL_COORDINATOR` (full access), `MEMBER` (read-only at workspace level)
- `ProductRole`: `PRODUCT_COORDINATOR`, `DEVELOPER_WORKER`, `VIEWER`
- `TenantACL` and `ProductACL` are static matrices mapping roles to `Permission[]`

Use `@RequirePermission(Permission.X)` on each endpoint handler. `GENERAL_COORDINATOR` bypasses ACL; `SUPER_ADMIN` bypasses everything.

### Adding a New App-Plane Endpoint

1. Create controller/service under `src/app/modules/app-plane/<domain>/`
2. Apply guard stack: `@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)`
3. Decorate each handler with `@RequirePermission(Permission.X)`
4. Inject `TenantConnectionService` and call `getTenantConnection()` for every DB query
5. **Insert an `audit_logs` record** for every `POST`, `PUT`/`PATCH`, and `DELETE` operation (ISO 27002 — non-negotiable)
6. Register the new entity in `app-plane-entities.ts` (`APP_PLANE_ENTITIES` array) — this is the single source of truth used by both `TenantConnectionService` and `TenantsService` when initializing a new tenant silo
7. Add the module to `AppPlaneModule`

### Session & Security (main.ts)

- **Session**: `express-session` with `connect-redis` (prefix `saas_sess:`); falls back to in-memory if Redis unavailable
- **CSRF**: `csrf-csrf` double-submit cookie (`__csrf`); exempt paths: `/api/auth/login`, forgot-password, verify-reset-code, reset-password, activate
- **CORS**: origins from `ALLOWED_ORIGINS` env var (comma-separated); must include `x-tenant-id` and `x-csrf-token` in allowed headers
- **Rate limiting**: 60 req/min per IP globally via `ThrottlerGuard`
- **Validation**: `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` (prevents mass assignment)

### Key Business Rules

- **Audit logging**: Every mutation endpoint must write to `audit_logs` with `userId`, `entityType`, `action` (CREATE/UPDATE/DELETE), `oldValues`, `newValues`
- **StrategicIndicator code**: `"{output_order}.{indicator_number}"` (e.g., `"1.3"`)
- **Catalog codes**: Normalized — spaces → underscores, accents stripped
- **Product custom fields**: EAV pattern — `ProductFieldDefinition` + `ProductCustomValue`
- **Tenant slug**: Stored in `Tenant.slug`; used as the key in the connection pool and the tenant DB name is `Tenant.dbName`

## Environment Variables

Required in `.env`:
```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME=control_plane
DB_SYNCHRONIZE=false   # never true in production
SESSION_SECRET          # min 32 chars (fatal if missing)
REDIS_URL or REDIS_HOST + REDIS_PASSWORD + REDIS_PORT
ALLOWED_ORIGINS         # e.g. http://localhost:4200
MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
COOKIE_SECURE, COOKIE_SAMESITE, CORS_ENABLED
```

## Reference Documents

| File | Purpose |
|------|---------|
| `API-ENDPOINTS.md` | Full REST API documentation |
| `BACKEND-CHANGES.md` | Recent backend modifications |
| `DOCKER-GUIDE.md` | Docker + Azure Container Registry deployment |
| `PRODUCTION-CHECKLIST.md` | Pre-deploy checklist |
| `../IAM_RBAC_DESIGN.md` | Security audit findings and known issues |
| `../ENTITY_USECASE_MAP.md` | Entity relationships and permission mapping |
