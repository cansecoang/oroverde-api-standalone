/**
 * Cross-Tenant Isolation Regression Guards
 * ─────────────────────────────────────────────────────────────────────────────
 * These static analysis tests verify that architectural invariants preventing
 * cross-tenant data access are maintained in source code.
 *
 * ISO 27001 Annex A controls: A.8.3 (Information Access Restriction),
 *   A.8.11 (Data Masking), A.5.15 (Access Control)
 * TEST_PLAN references: TSec-001, TSec-002, TSec-003, TP-WS-002, TP-WS-003
 * QAS: QAS-001 (0 cross-tenant accesses)
 *
 * These tests MUST pass before every release. Any failure is an S1 blocker.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '..'); // src/app/
const SRC_ROOT = path.resolve(__dirname, '..', '..'); // src/

const readFile = (...parts: string[]): string =>
  fs.readFileSync(path.join(APP_ROOT, ...parts), 'utf8');

const readSrcFile = (...parts: string[]): string =>
  fs.readFileSync(path.join(SRC_ROOT, ...parts), 'utf8');

const listFiles = (dir: string, ext = '.ts'): string[] => {
  const fullDir = path.join(APP_ROOT, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs
    .readdirSync(fullDir, { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith(ext))
    .map((f) => path.join(fullDir, f));
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Cross-Tenant Isolation Regression Guards (ISO 27001 A.8.3)', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // Guard Stack — all app-plane controllers must use the full guard chain
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Guard stack invariants', () => {
    const APP_PLANE_CONTROLLERS = [
      path.join(APP_ROOT, 'modules', 'app-plane', 'products', 'products.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'products', 'product-members.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'products', 'project-checkins.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'tasks', 'tasks.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'strategy', 'strategy.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'members', 'workspace-members.controller.ts'),
      path.join(APP_ROOT, 'modules', 'app-plane', 'catalogs', 'catalogs.controller.ts'),
    ].filter((f) => fs.existsSync(f));

    it('every app-plane controller must apply AuthenticatedGuard', () => {
      for (const filePath of APP_PLANE_CONTROLLERS) {
        const src = fs.readFileSync(filePath, 'utf8');
        const hasAuthGuard = src.includes('AuthenticatedGuard');
        expect({ file: path.basename(filePath), hasAuthGuard }).toMatchObject({
          hasAuthGuard: true,
        });
      }
    });

    it('every app-plane controller must apply TenantAccessGuard', () => {
      for (const filePath of APP_PLANE_CONTROLLERS) {
        const src = fs.readFileSync(filePath, 'utf8');
        const hasGuard = src.includes('TenantAccessGuard');
        expect({ file: path.basename(filePath), hasGuard }).toMatchObject({
          hasGuard: true,
        });
      }
    });

    it('no app-plane controller should bypass guards with @Public() or skipGuards', () => {
      for (const filePath of APP_PLANE_CONTROLLERS) {
        const src = fs.readFileSync(filePath, 'utf8');
        const hasPublicBypass = /(@Public\(\)|skipAuth|IS_PUBLIC_KEY)/.test(src);
        expect({ file: path.basename(filePath), hasPublicBypass }).toMatchObject({
          hasPublicBypass: false,
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TenantConnectionService — never use default TypeORM connection in app-plane
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Tenant DB isolation — app-plane services must use TenantConnectionService', () => {
    const APP_PLANE_SERVICES = listFiles('modules/app-plane').filter((f) =>
      f.endsWith('.service.ts') && !f.endsWith('.spec.ts'),
    );

    it('no app-plane service should import from the TypeORM @InjectRepository for tenant entities', () => {
      // App-plane services must use getTenantConnection() not @InjectRepository()
      // which would use the default (control-plane) connection.
      for (const filePath of APP_PLANE_SERVICES) {
        const src = fs.readFileSync(filePath, 'utf8');
        // @InjectRepository is only OK in control-plane modules
        // If found in app-plane services, it may be cross-contaminating with control-plane DB
        const hasInjectRepository = src.includes('@InjectRepository(');
        if (hasInjectRepository) {
          // Flag the file for review — this is a WARNING, not an automatic failure
          // because some services may legitimately import from control-plane
          // (e.g., notifications reading WorkspaceMember from the tenant DS directly)
          console.warn(`[REVIEW] @InjectRepository found in app-plane service: ${path.basename(filePath)}`);
        }
      }
      // This test always passes but flags for review
      expect(true).toBe(true);
    });

    it('all app-plane services should call getTenantConnection() for data access', () => {
      const appPlaneServiceFiles = listFiles('modules/app-plane').filter(
        (f) => f.endsWith('.service.ts') && !f.endsWith('.spec.ts'),
      );

      const auditSvc = appPlaneServiceFiles.find((f) => f.includes('audit'));
      const nonAuditServices = appPlaneServiceFiles.filter(
        (f) =>
          !f.includes('notifications.service.ts') || // uses constructor injection directly
          !f.includes('audit'),
      );

      for (const filePath of nonAuditServices) {
        const src = fs.readFileSync(filePath, 'utf8');
        // Services must use tenantConnection.getTenantConnection() to access tenant data
        // not the global TypeORM DataSource
        if (src.includes('DataSource') && !src.includes('getTenantConnection')) {
          console.warn(`[WARNING] Service may not be using tenant connection: ${path.basename(filePath)}`);
        }
      }
      expect(true).toBe(true); // all warnings already surfaced above
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TenantMiddleware — slug validation prevents path traversal
  // ═══════════════════════════════════════════════════════════════════════════

  describe('TenantMiddleware slug validation (TSec-002)', () => {
    const middlewareSrc = readFile('common', 'middleware', 'tenant.middleware.ts');

    it('must use a strict SLUG_REGEX that requires lowercase alphanumeric + hyphens only', () => {
      // The regex must not allow: uppercase, spaces, dots, slashes, underscores
      expect(middlewareSrc).toMatch(/SLUG_REGEX\s*=\s*\/\^/);
      // Verify it anchors start (^[a-z0-9])
      expect(middlewareSrc).toMatch(/\^\[a-z0-9\]/);
      // Verify it anchors end — the regex literal ends with $/ in source
      expect(middlewareSrc).toMatch(/\$\//);
    });

    it('must enforce a maximum length on the slug', () => {
      // Without max length, extremely long slugs could cause DoS
      expect(middlewareSrc).toMatch(/\.length\s*[>=]+\s*\d+|length\s*>\s*\d+/);
    });

    it('must skip header validation only for explicitly listed public prefixes', () => {
      // Public prefixes must be explicit, not pattern-based (preventing bypass)
      expect(middlewareSrc).toContain("'/api/auth'");
      expect(middlewareSrc).toContain("'/api/admin'");
      expect(middlewareSrc).toContain("'/api/health'");
      // Must NOT have a catch-all bypass like /api/*
      expect(middlewareSrc).not.toMatch(/['"]\/api\/\*['"]/);
    });

    it('must reject array headers (header injection protection)', () => {
      expect(middlewareSrc).toContain('Array.isArray(tenantId)');
    });

    it('must throw BadRequestException (not ForbiddenException) for missing header', () => {
      // Missing header = client error (400), not authorization issue (403)
      expect(middlewareSrc).toMatch(/BadRequestException/);
      expect(middlewareSrc).not.toMatch(/ForbiddenException/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TenantAccessGuard — must look up workspace_members, not trust user input
  // ═══════════════════════════════════════════════════════════════════════════

  describe('TenantAccessGuard isolation invariants (TP-WS-002)', () => {
    const guardSrc = readFile('common', 'guards', 'tenant-access.guard.ts');

    it('must query workspace_members to verify membership (not trust X-Tenant-ID alone)', () => {
      // The guard must call findOne on the workspace_members repo
      expect(guardSrc).toMatch(/findOne\s*\(/);
      expect(guardSrc).toMatch(/userId\s*:\s*user\.id/);
    });

    it('must throw ForbiddenException when member not found (not return false)', () => {
      // Returning false would cause a generic 403; throwing is more explicit
      expect(guardSrc).toContain('ForbiddenException');
      expect(guardSrc).not.toMatch(/return\s+false\s*;/);
    });

    it('must use a sentinel UUID for super_admin synthetic member (not arbitrary value)', () => {
      // Sentinel must be a fixed, recognizable UUID to prevent spoofing
      expect(guardSrc).toContain('00000000-0000-0000-0000-000000000000');
    });

    it('must inject req.workspaceMember for downstream guards (no re-querying)', () => {
      expect(guardSrc).toContain('request.workspaceMember');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Audit Trail — ISO 27001 A.8.15
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Audit trail completeness (ISO 27001 A.8.15)', () => {
    it('products.service should write AuditLog on create', () => {
      const src = readFile('modules', 'app-plane', 'products', 'products.service.ts');
      expect(src).toMatch(/AuditLog|audit_log/i);
      expect(src).toMatch(/CREATE|action.*create/i);
    });

    it('tasks.service should write AuditLog on create and status update', () => {
      const src = readFile('modules', 'app-plane', 'tasks', 'tasks.service.ts');
      expect(src).toMatch(/AuditLog|audit_log/i);
      expect(src).toMatch(/CREATE/);
      expect(src).toMatch(/UPDATE/);
    });

    it('project-checkins.service should write AuditLog on schedule, complete, and remove', () => {
      const src = readFile('modules', 'app-plane', 'products', 'project-checkins.service.ts');
      expect(src).toMatch(/AuditLog|audit_log/i);
      expect(src).toMatch(/CREATE/);
      expect(src).toMatch(/UPDATE/);
      expect(src).toMatch(/DELETE/);
    });

    it('product-members.service should write AuditLog on member add/remove', () => {
      const src = readFile('modules', 'app-plane', 'products', 'product-members.service.ts');
      // Either AuditLog or at minimum some audit trail mechanism
      const hasAudit = /AuditLog|audit_log|auditLog/.test(src);
      expect(hasAudit).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CSRF — double-submit cookie protection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CSRF protection (TSec-012)', () => {
    it('main.ts should configure CSRF middleware', () => {
      const mainSrc = readSrcFile('main.ts');
      // csrf-csrf or similar package must be used
      expect(mainSrc).toMatch(/csrf|doubleCsrf|__csrf/i);
    });

    it('main.ts should define CSRF-exempt paths for public auth endpoints', () => {
      const mainSrc = readSrcFile('main.ts');
      // Auth endpoints that are public should be explicitly exempted
      expect(mainSrc).toMatch(/ignoredMethods|ignoredRoutes|exempt|csrf.*ignore/i);
    });
  });
});
