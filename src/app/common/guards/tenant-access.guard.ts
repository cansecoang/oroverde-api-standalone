import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { EntityTarget } from 'typeorm';

import { GlobalRole } from '../enums/global-roles.enum';
import { TenantRole } from '../enums/business-roles.enum';
import { TENANT_CONNECTION_TOKEN, WORKSPACE_MEMBER_ENTITY } from '../tokens/tenancy.tokens';
import { ITenantConnection, IWorkspaceMember } from '../interfaces/tenancy.interfaces';

// Sentinel UUID used to identify synthetic super-admin workspace members (closes C-8)
const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * TenantAccessGuard
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifica que el usuario autenticado sea miembro del workspace/tenant
 * identificado en el header X-Tenant-ID (puesto por TenantMiddleware).
 *
 * - SUPER_ADMIN: inyecta un workspaceMember sintético con rol GENERAL_COORDINATOR.
 * - Otro usuario: busca su registro en workspace_members del tenant.
 *
 * Inyecta req.workspaceMember para que HybridPermissionsGuard no repita la query.
 *
 * Stack: AuthenticatedGuard → TenantAccessGuard → HybridPermissionsGuard
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    @Inject(TENANT_CONNECTION_TOKEN)
    private readonly tenantConnectionService: ITenantConnection,
    @Inject(WORKSPACE_MEMBER_ENTITY)
    private readonly wsMemberEntity: EntityTarget<IWorkspaceMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('Usuario no identificado');
    }

    // =========================================================
    // 🌐 SUPER ADMIN — usar miembro real si existe, sintético como fallback
    // =========================================================
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      // Intentar obtener el WorkspaceMember real del super admin en este tenant
      try {
        const tenantDataSource = await this.tenantConnectionService.getTenantConnection();
        const realMember = (await tenantDataSource
          .getRepository(this.wsMemberEntity)
          .findOne({
            where: { userId: user.id },
          } as any)) as IWorkspaceMember | null;

        if (realMember) {
          request.workspaceMember = realMember;
          return true;
        }
      } catch {
        // Si falla la conexión al tenant, usar el sintético
      }

      // Fallback: miembro sintético (lectura/acceso sin escritura de FKs)
      request.workspaceMember = {
        id: SUPER_ADMIN_SENTINEL_ID,
        userId: user.id,
        tenantRole: TenantRole.GENERAL_COORDINATOR,
      } satisfies IWorkspaceMember;
      return true;
    }

    // =========================================================
    // 🏢 Verificar membresía en workspace_members del tenant
    // =========================================================
    const tenantDataSource = await this.tenantConnectionService.getTenantConnection();

    const workspaceMember = (await tenantDataSource
      .getRepository(this.wsMemberEntity)
      .findOne({
        where: { userId: user.id },
      } as any)) as IWorkspaceMember | null;

    if (!workspaceMember) {
      throw new ForbiddenException('No eres miembro de este Workspace/Tenant');
    }

    // Inyectar para HybridPermissionsGuard (evita re-query)
    request.workspaceMember = workspaceMember;

    return true;
  }
}
