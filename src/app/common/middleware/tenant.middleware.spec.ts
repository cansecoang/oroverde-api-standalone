import { BadRequestException } from '@nestjs/common';
import { TenantMiddleware, RequestWithTenant } from './tenant.middleware';
import { Response } from 'express';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<RequestWithTenant> = {}): RequestWithTenant {
  return {
    baseUrl: '',
    path: '/products',
    headers: { 'x-tenant-id': 'alpha' },
    ...overrides,
  } as unknown as RequestWithTenant;
}

const res = {} as Response;
const next = jest.fn();

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  beforeEach(() => {
    middleware = new TenantMiddleware();
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Public routes — skip tenant header requirement
  // ═══════════════════════════════════════════════════════════════════════════

  describe('public routes (no header required)', () => {
    it.each([
      ['/api/auth', '/api/auth'],
      ['/api/auth/login', '/api/auth'],
      ['/api/admin', '/api/admin'],
      ['/api/admin/users', '/api/admin'],
      ['/api/health', '/api/health'],
      ['/health', '/health'],
      ['/docs', '/docs'],
      ['/docs/json', '/docs'],
    ])('should allow %s without x-tenant-id header', (path, baseUrl) => {
      const req = makeReq({ path: path.replace(baseUrl, ''), baseUrl, headers: {} });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.tenantId).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tenant routes — header required and validated
  // ═══════════════════════════════════════════════════════════════════════════

  describe('tenant routes (header required)', () => {
    it('should set req.tenantId and call next for valid slug', () => {
      const req = makeReq({ headers: { 'x-tenant-id': 'workspace-alpha' } });
      middleware.use(req, res, next);
      expect(req.tenantId).toBe('workspace-alpha');
      expect(next).toHaveBeenCalled();
    });

    it('should lowercase and trim the slug', () => {
      const req = makeReq({ headers: { 'x-tenant-id': '  Alpha  ' } });
      middleware.use(req, res, next);
      expect(req.tenantId).toBe('alpha');
    });

    it('should throw BadRequestException when x-tenant-id header is missing', () => {
      const req = makeReq({ headers: {} });
      expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
      expect(() => middleware.use(req, res, next)).toThrow('Falta el header X-Tenant-ID');
    });

    it('should throw BadRequestException when header is an array (duplicate header)', () => {
      const req = makeReq({ headers: { 'x-tenant-id': ['alpha', 'beta'] as any } });
      expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
      expect(() => middleware.use(req, res, next)).toThrow('Formato de header inválido');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Slug format validation — ISO 27001 A.8.3 / TSec-002
  // ═══════════════════════════════════════════════════════════════════════════

  describe('slug format validation (ISO 27001 A.8.3)', () => {
    it.each([
      ['alpha', true],
      ['workspace-one', true],
      ['tenant123', true],
      ['abc-def-ghi', true],
    ])('should accept valid slug "%s"', (slug, shouldPass) => {
      const req = makeReq({ headers: { 'x-tenant-id': slug } });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it.each([
      // Note: middleware lowercases before validating, so uppercase is effectively valid.
      // These slugs are invalid AFTER lowercasing or regardless of casing:
      'my tenant',         // space — invalid after lowercase
      '../control_plane',  // path traversal — invalid chars
      'tenant_one',        // underscore — not in regex
      'a'.repeat(51),      // over 50 chars
      '-leading-dash',     // leading dash — regex requires starting with alphanumeric
      'trailing-dash-',    // trailing dash — regex requires ending with alphanumeric
    ])('should throw BadRequestException for invalid slug "%s"', (slug) => {
      const req = makeReq({ headers: { 'x-tenant-id': slug } });
      expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
    });

    it('should accept MyTenant by lowercasing it to mytenant (valid)', () => {
      // The middleware lowercases before regex validation — so uppercase input is accepted
      const req = makeReq({ headers: { 'x-tenant-id': 'MyTenant' } });
      middleware.use(req, res, next);
      expect(req.tenantId).toBe('mytenant');
      expect(next).toHaveBeenCalled();
    });

    it('should reject slug of exactly 51 chars (over limit)', () => {
      const slug = 'a'.repeat(51);
      const req = makeReq({ headers: { 'x-tenant-id': slug } });
      expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
    });

    it('should accept slug of exactly 50 chars (at limit)', () => {
      // 50 chars of valid format: 'a' repeated 50 times
      const slug = 'a'.repeat(50);
      const req = makeReq({ headers: { 'x-tenant-id': slug } });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should NOT allow path traversal via x-tenant-id (TSec-002)', () => {
      const traversalAttempts = [
        '../admin',
        'alpha/../beta',
        'alpha%2F..%2Fbeta',
      ];
      for (const slug of traversalAttempts) {
        const req = makeReq({ headers: { 'x-tenant-id': slug } });
        expect(() => middleware.use(req, res, next)).toThrow(BadRequestException);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Root path
  // ═══════════════════════════════════════════════════════════════════════════

  describe('root path', () => {
    it('should call next without tenantId for root path /', () => {
      const req = makeReq({ baseUrl: '', path: '/', headers: {} });
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.tenantId).toBeUndefined();
    });
  });
});
