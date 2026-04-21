import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantAccessGuard } from './tenant-access.guard';
import { GlobalRole } from '../enums/global-roles.enum';
import { TenantRole } from '../enums/business-roles.enum';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

// ── Factories ────────────────────────────────────────────────────────────────

function makeContext(user: Record<string, any>): ExecutionContext {
  const request: Record<string, any> = { user, workspaceMember: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    __request: request,
  } as unknown as ExecutionContext;
}

function makeTenantConn(member: Record<string, any> | null = null) {
  return {
    getTenantConnection: jest.fn().mockResolvedValue({
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(member),
      }),
    }),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TenantAccessGuard', () => {
  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario: Super Admin
  // ═══════════════════════════════════════════════════════════════════════════

  describe('SUPER_ADMIN users', () => {
    const superAdmin = { id: 'super-1', globalRole: GlobalRole.SUPER_ADMIN };

    it('should pass and inject real workspaceMember when super_admin is already a workspace member', async () => {
      const realMember = { id: 'ws-member-1', userId: 'super-1', tenantRole: TenantRole.GENERAL_COORDINATOR };
      const ctx = makeContext(superAdmin);
      const guard = new TenantAccessGuard(makeTenantConn(realMember) as any, {} as any);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = (ctx as any).__request;
      expect(req.workspaceMember).toEqual(realMember);
      expect(req.workspaceMember.id).not.toBe(SUPER_ADMIN_SENTINEL_ID);
    });

    it('should pass and inject sentinel workspaceMember when super_admin is NOT a workspace member', async () => {
      const ctx = makeContext(superAdmin);
      const guard = new TenantAccessGuard(makeTenantConn(null) as any, {} as any);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = (ctx as any).__request;
      expect(req.workspaceMember.id).toBe(SUPER_ADMIN_SENTINEL_ID);
      expect(req.workspaceMember.tenantRole).toBe(TenantRole.GENERAL_COORDINATOR);
    });

    it('should fall back to sentinel if tenant connection throws for super_admin', async () => {
      const failingConn = {
        getTenantConnection: jest.fn().mockRejectedValue(new Error('DB timeout')),
      };
      const ctx = makeContext(superAdmin);
      const guard = new TenantAccessGuard(failingConn as any, {} as any);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = (ctx as any).__request;
      expect(req.workspaceMember.id).toBe(SUPER_ADMIN_SENTINEL_ID);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario: Regular User
  // ═══════════════════════════════════════════════════════════════════════════

  describe('regular USER', () => {
    const regularUser = { id: 'user-1', globalRole: GlobalRole.USER };

    it('should pass and inject workspaceMember when user is a tenant member', async () => {
      const member = { id: 'ws-2', userId: 'user-1', tenantRole: TenantRole.MEMBER };
      const ctx = makeContext(regularUser);
      const guard = new TenantAccessGuard(makeTenantConn(member) as any, {} as any);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      const req = (ctx as any).__request;
      expect(req.workspaceMember).toEqual(member);
    });

    it('should throw ForbiddenException when user is NOT a tenant member', async () => {
      const ctx = makeContext(regularUser);
      const guard = new TenantAccessGuard(makeTenantConn(null) as any, {} as any);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user object is missing', async () => {
      const ctx = makeContext(undefined as any);
      const guard = new TenantAccessGuard(makeTenantConn(null) as any, {} as any);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user.id is missing', async () => {
      const ctx = makeContext({ globalRole: GlobalRole.USER }); // no id
      const guard = new TenantAccessGuard(makeTenantConn(null) as any, {} as any);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ISO 27001 A.8.3 — Cross-tenant isolation assurance
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-tenant isolation (ISO 27001 A.8.3)', () => {
    it('should NOT share workspaceMember between two different users in the same guard pass', async () => {
      const memberA = { id: 'ws-A', userId: 'user-A', tenantRole: TenantRole.MEMBER };
      const memberB = { id: 'ws-B', userId: 'user-B', tenantRole: TenantRole.GENERAL_COORDINATOR };

      const ctxA = makeContext({ id: 'user-A', globalRole: GlobalRole.USER });
      const ctxB = makeContext({ id: 'user-B', globalRole: GlobalRole.USER });

      // Two different guard instances (as they would be in different requests)
      const guardA = new TenantAccessGuard(makeTenantConn(memberA) as any, {} as any);
      const guardB = new TenantAccessGuard(makeTenantConn(memberB) as any, {} as any);

      await guardA.canActivate(ctxA);
      await guardB.canActivate(ctxB);

      expect((ctxA as any).__request.workspaceMember.id).toBe('ws-A');
      expect((ctxB as any).__request.workspaceMember.id).toBe('ws-B');
    });
  });
});
