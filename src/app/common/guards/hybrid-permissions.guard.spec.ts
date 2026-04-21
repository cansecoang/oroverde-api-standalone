import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HybridPermissionsGuard } from './hybrid-permissions.guard';
import { GlobalRole } from '../enums/global-roles.enum';
import { TenantRole, ProductRole, Permission } from '../enums/business-roles.enum';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

// ── Factories ────────────────────────────────────────────────────────────────

function makeReflector(permission: Permission | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(permission),
  } as unknown as Reflector;
}

function makeRequest(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    user: { id: 'user-1', globalRole: GlobalRole.USER },
    workspaceMember: null,
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function makeContext(request: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeProductMemberRepo(member: Record<string, any> | null) {
  return { findOne: jest.fn().mockResolvedValue(member) };
}

function makeTenantConn(productMemberRepo: any = makeProductMemberRepo(null)) {
  return {
    getTenantConnection: jest.fn().mockResolvedValue({
      getRepository: jest.fn().mockReturnValue(productMemberRepo),
    }),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('HybridPermissionsGuard', () => {
  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // No permission required → always pass
  // ═══════════════════════════════════════════════════════════════════════════

  describe('routes without @RequirePermission()', () => {
    it('should return true — membership already verified by TenantAccessGuard', async () => {
      const guard = new HybridPermissionsGuard(makeReflector(undefined), makeTenantConn() as any, {} as any, {} as any);
      const req = makeRequest({ workspaceMember: { id: 'ws-1', tenantRole: TenantRole.MEMBER } });

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPER_ADMIN bypass
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SUPER_ADMIN (global bypass)', () => {
    it('should bypass all permission checks', async () => {
      const req = makeRequest({ user: { id: 'admin-1', globalRole: GlobalRole.SUPER_ADMIN } });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.STRATEGY_GLOBAL_WRITE), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL_COORDINATOR bypass (god mode)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GENERAL_COORDINATOR', () => {
    it('should bypass all permission checks including STRATEGY_GLOBAL_WRITE', async () => {
      const req = makeRequest({
        workspaceMember: { id: 'coord-1', tenantRole: TenantRole.GENERAL_COORDINATOR },
      });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.STRATEGY_GLOBAL_WRITE), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('should bypass even for MEMBER_MANAGE', async () => {
      const req = makeRequest({
        workspaceMember: { id: 'coord-1', tenantRole: TenantRole.GENERAL_COORDINATOR },
      });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.MEMBER_MANAGE), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMBER role — TenantACL check
  // ═══════════════════════════════════════════════════════════════════════════

  describe('MEMBER tenant role — TenantACL', () => {
    const memberWs = { id: 'ws-m', tenantRole: TenantRole.MEMBER };

    it('should pass for PRODUCT_READ (in TenantACL for MEMBER)', async () => {
      const req = makeRequest({ workspaceMember: memberWs });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.PRODUCT_READ), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('should pass for STRATEGY_READ (in TenantACL for MEMBER)', async () => {
      const req = makeRequest({ workspaceMember: memberWs });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.STRATEGY_READ), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('should pass for MEMBER_READ (in TenantACL for MEMBER)', async () => {
      const req = makeRequest({ workspaceMember: memberWs });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.MEMBER_READ), makeTenantConn() as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('should throw ForbiddenException for STRATEGY_GLOBAL_WRITE (not in TenantACL for MEMBER)', async () => {
      const req = makeRequest({ workspaceMember: memberWs, params: {} });
      const conn = makeTenantConn(makeProductMemberRepo(null));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.STRATEGY_GLOBAL_WRITE), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for MEMBER_MANAGE (coordinator-only)', async () => {
      const req = makeRequest({ workspaceMember: memberWs, params: {} });
      const conn = makeTenantConn(makeProductMemberRepo(null));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.MEMBER_MANAGE), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ProductACL — product-scoped checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ProductACL — product-scoped permissions', () => {
    const memberWs = { id: 'ws-m', tenantRole: TenantRole.MEMBER };

    it('PRODUCT_COORDINATOR should have TASK_WRITE for their product', async () => {
      const productMember = { id: 'pm-1', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.PRODUCT_COORDINATOR };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.TASK_WRITE), conn as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('PRODUCT_COORDINATOR should have CHECKIN_WRITE for their product', async () => {
      const productMember = { id: 'pm-1', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.PRODUCT_COORDINATOR };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.CHECKIN_WRITE), conn as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('VIEWER should NOT have TASK_WRITE', async () => {
      const productMember = { id: 'pm-2', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.VIEWER };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.TASK_WRITE), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });

    it('VIEWER should NOT have CHECKIN_WRITE', async () => {
      const productMember = { id: 'pm-2', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.VIEWER };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.CHECKIN_WRITE), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });

    it('VIEWER should have TASK_READ', async () => {
      const productMember = { id: 'pm-2', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.VIEWER };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.TASK_READ), conn as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });

    it('should throw ForbiddenException when member has no product membership', async () => {
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-999' } });
      const conn = makeTenantConn(makeProductMemberRepo(null));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.TASK_READ), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });

    it('DEVELOPER_WORKER should NOT have TASK_DELETE', async () => {
      const productMember = { id: 'pm-3', memberId: 'ws-m', productId: 'prod-1', productRole: ProductRole.DEVELOPER_WORKER };
      const req = makeRequest({ workspaceMember: memberWs, params: { productId: 'prod-1' } });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.TASK_DELETE), conn as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });

    it('DEVELOPER_WORKER should have PRODUCT_REQUEST_WRITE', async () => {
      const productMember = { id: 'pm-3', memberId: 'ws-m', productRole: ProductRole.DEVELOPER_WORKER };
      // No productId in params — tests the global product write path
      const req = makeRequest({ workspaceMember: memberWs, params: {} });
      const conn = makeTenantConn(makeProductMemberRepo(productMember));
      const guard = new HybridPermissionsGuard(makeReflector(Permission.PRODUCT_REQUEST_WRITE), conn as any, {} as any, {} as any);

      expect(await guard.canActivate(makeContext(req))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Guard safety — missing workspaceMember
  // ═══════════════════════════════════════════════════════════════════════════

  describe('guard safety', () => {
    it('should throw ForbiddenException when workspaceMember is not injected (TenantAccessGuard bypassed)', async () => {
      const req = makeRequest({ workspaceMember: undefined });
      const guard = new HybridPermissionsGuard(makeReflector(Permission.PRODUCT_READ), makeTenantConn() as any, {} as any, {} as any);

      await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
    });
  });
});
