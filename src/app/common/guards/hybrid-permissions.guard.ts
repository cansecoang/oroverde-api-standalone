import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntityTarget } from 'typeorm';

import {
  Permission,
  ProductACL,
  ProductRole,
  TenantACL,
  TenantRole,
} from '../enums/business-roles.enum';
import { GlobalRole } from '../enums/global-roles.enum';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

import { TENANT_CONNECTION_TOKEN, WORKSPACE_MEMBER_ENTITY, PRODUCT_MEMBER_ENTITY } from '../tokens/tenancy.tokens';
import { ITenantConnection, IWorkspaceMember, IProductMember } from '../interfaces/tenancy.interfaces';

/**
 * HybridPermissionsGuard (refactorizado)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ya NO verifica membresía al workspace ni inyecta req.workspaceMember.
 * Esa responsabilidad es del TenantAccessGuard (ejecuta antes).
 *
 * Este guard se enfoca exclusivamente en verificar PERMISOS:
 *  - Si la ruta no tiene @RequirePermission() → pasa (membresía ya verificada).
 *  - Si la tiene → verifica TenantACL / ProductACL según el rol.
 *
 * Stack esperado: AuthenticatedGuard → TenantAccessGuard → HybridPermissionsGuard
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class HybridPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(TENANT_CONNECTION_TOKEN)
    private readonly tenantConnectionService: ITenantConnection,
    @Inject(WORKSPACE_MEMBER_ENTITY)
    private readonly wsMemberEntity: EntityTarget<IWorkspaceMember>,
    @Inject(PRODUCT_MEMBER_ENTITY)
    private readonly productMemberEntity: EntityTarget<IProductMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. ¿Qué permiso pide la ruta?
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si la ruta no pide permiso, pasa.
    // La membresía ya fue verificada por TenantAccessGuard.
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('Usuario no identificado');
    }

    // =========================================================
    // 🌐 NIVEL 0: SUPER ADMIN GLOBAL — bypass total
    // TenantAccessGuard ya inyectó el workspaceMember sintético
    // con UUID sentinel (cierra C-8).
    // =========================================================
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      return true;
    }

    // =========================================================
    // 👑 NIVEL 1: Reutilizar workspaceMember de TenantAccessGuard
    // Ya NO se repite la query a workspace_members.
    // =========================================================
    const workspaceMember = request.workspaceMember as IWorkspaceMember | undefined;

    if (!workspaceMember) {
      throw new ForbiddenException('No eres miembro de este Workspace/Tenant');
    }

    // SI ES COORDINADOR GENERAL, TIENE LLAVE MAESTRA 🗝️
    if (workspaceMember.tenantRole === TenantRole.GENERAL_COORDINATOR) {
      return true;
    }

    // =========================================================
    // 🏢 NIVEL 1.5: TENANT ACL (Permisos a nivel workspace para MEMBER)
    // =========================================================
    const tenantPermissions = TenantACL[workspaceMember.tenantRole as TenantRole];
    if (tenantPermissions && tenantPermissions.includes(requiredPermission)) {
      return true;
    }

    // =========================================================
    // 📦 NIVEL 2: PRODUCT MODE (Product Role)
    // =========================================================
    const productId =
      request.params?.productId ||
      request.body?.productId ||
      request.query?.productId;

    if (!productId) {
      const tenantDataSource = await this.tenantConnectionService.getTenantConnection();
      const productMemberRepo = tenantDataSource.getRepository(this.productMemberEntity);

      // Global product writes (create product) are allowed for users that are
      // already product coordinators in at least one existing product.
      if (requiredPermission === Permission.PRODUCT_WRITE) {
        const coordinatorMembership = (await productMemberRepo.findOne({
          where: {
            memberId: workspaceMember.id,
            productRole: ProductRole.PRODUCT_COORDINATOR,
          },
        } as any)) as IProductMember | null;

        if (coordinatorMembership) {
          return true;
        }
      }

      // Product creation requests: DEVELOPER_WORKER in any product can submit requests.
      if (requiredPermission === Permission.PRODUCT_REQUEST_WRITE) {
        const workerMembership = (await productMemberRepo.findOne({
          where: {
            memberId: workspaceMember.id,
            productRole: ProductRole.DEVELOPER_WORKER,
          },
        } as any)) as IProductMember | null;

        if (workerMembership) {
          return true;
        }
      }

      // Product request review: PRODUCT_COORDINATOR in any product can review requests.
      if (requiredPermission === Permission.PRODUCT_REQUEST_REVIEW) {
        const coordinatorMembership = (await productMemberRepo.findOne({
          where: {
            memberId: workspaceMember.id,
            productRole: ProductRole.PRODUCT_COORDINATOR,
          },
        } as any)) as IProductMember | null;

        if (coordinatorMembership) {
          return true;
        }
      }

      throw new ForbiddenException('Se requiere nivel General Coordinator o Product Coordinator para esta acción global');
    }

    // Conexión al silo del tenant (ya cacheada en pool)
    const tenantDataSource = await this.tenantConnectionService.getTenantConnection();

    const productMember = (await tenantDataSource
      .getRepository(this.productMemberEntity)
      .findOne({
        where: {
          memberId: workspaceMember.id,
          productId: productId,
        },
      } as any)) as IProductMember | null;

    if (!productMember) {
      throw new ForbiddenException('No tienes acceso a este producto específico');
    }

    // =========================================================
    // 🔍 NIVEL 3: ACL CHECK (Matriz de Permisos)
    // =========================================================
    const permissions = ProductACL[productMember.productRole as ProductRole];

    if (permissions && permissions.includes(requiredPermission)) {
      return true;
    }

    throw new ForbiddenException(
      `Tu rol de '${productMember.productRole}' en este producto no tiene permiso: ${requiredPermission}`,
    );
  }
}
