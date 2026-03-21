import { Injectable, Inject, Scope } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability';
import { EntityTarget } from 'typeorm';

import { AppAbility } from './casl-types';
import { GlobalRole } from '../enums/global-roles.enum';
import { TenantRole } from '../enums/business-roles.enum';
import {
  TENANT_CONNECTION_TOKEN,
  WORKSPACE_MEMBER_ENTITY,
  PRODUCT_MEMBER_ENTITY,
} from '../tokens/tenancy.tokens';
import {
  ITenantConnection,
  IWorkspaceMember,
  IProductMember,
} from '../interfaces/tenancy.interfaces';

// REQUEST-scoped: obligatorio porque depende de ITenantConnection que es REQUEST-scoped.
// Si fuera singleton, recibiría una snapshot congelada del servicio de conexión.
@Injectable({ scope: Scope.REQUEST })
export class AbilityFactory {
  constructor(
    @Inject(TENANT_CONNECTION_TOKEN)
    private readonly tenantConnection: ITenantConnection,
    @Inject(WORKSPACE_MEMBER_ENTITY)
    private readonly wsMemberEntity: EntityTarget<IWorkspaceMember>,
    @Inject(PRODUCT_MEMBER_ENTITY)
    private readonly productMemberEntity: EntityTarget<IProductMember>,
  ) {}

  /**
   * Construye el AppAbility para el usuario autenticado en el contexto
   * del tenant activo. Hace UNA sola query para todas las membresías de
   * producto — más eficiente que las 2-3 queries del HybridPermissionsGuard.
   */
  async createForRequest(
    user: { id: string; globalRole: string; isActive: boolean },
    workspaceMember: IWorkspaceMember,
  ): Promise<AppAbility> {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    // ─────────────────────────────────────────────────────────────────────────
    // NIVEL 0: SUPER_ADMIN — bypass total
    // ─────────────────────────────────────────────────────────────────────────
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      can('manage', 'all');
      return build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NIVEL 1: GENERAL_COORDINATOR — llave maestra del workspace
    // ─────────────────────────────────────────────────────────────────────────
    if (workspaceMember.tenantRole === TenantRole.GENERAL_COORDINATOR) {
      can('manage', 'Product');
      can('manage', 'Task');
      can('manage', 'Strategy');
      can('manage', 'CheckIn');
      can('manage', 'ProductRequest');
      can('manage', 'ProductMember');
      can('manage', 'WorkspaceMember');
      can('manage', 'Catalog');
      can('manage', 'FieldDefinition');
      return build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NIVEL 2: MEMBER — permisos base del workspace (lectura global)
    //          Fix B-1: todos los MEMBER pueden solicitar producto,
    //          independientemente de si tienen productos asignados.
    // ─────────────────────────────────────────────────────────────────────────
    can('read', 'Product');
    can('read', 'Strategy');
    can('read', 'CheckIn');
    can('read', 'WorkspaceMember');
    can('read', 'ProductMember');
    can('read', 'Catalog');
    can('read', 'FieldDefinition');
    can('create', 'ProductRequest'); // ← fix B-1

    // ─────────────────────────────────────────────────────────────────────────
    // NIVEL 3: PRODUCT ROLES — una sola query, todas las membresías
    //          Fix B-2: permisos acotados por productId concreto.
    // ─────────────────────────────────────────────────────────────────────────
    const dataSource = await this.tenantConnection.getTenantConnection();
    const productMemberships = (await dataSource
      .getRepository(this.productMemberEntity)
      .find({ where: { memberId: workspaceMember.id } } as any)) as IProductMember[];

    for (const membership of productMemberships) {
      const pid = membership.productId;

      switch (membership.productRole) {
        case 'product_coordinator':
          // Fix B-2: update/delete acotados a SU productId — no a cualquier producto
          can('create', 'Product');
          can('update', 'Product', { id: pid } as any);
          can('delete', 'Product', { id: pid } as any);
          can('review', 'ProductRequest');
          can('manage', 'ProductMember', { productId: pid } as any);
          can('manage', 'Task', { productId: pid } as any);
          can('write', 'Strategy', { productId: pid } as any);
          can('read', 'Strategy');
          can('create', 'CheckIn', { productId: pid } as any);
          can('update', 'CheckIn', { productId: pid } as any);
          can('delete', 'CheckIn', { productId: pid } as any);
          break;

        case 'developer_worker':
          can('read', 'Task', { productId: pid } as any);
          can('create', 'Task', { productId: pid } as any);
          can('update', 'Task', { productId: pid } as any);
          can('updateStatus', 'Task', { productId: pid } as any);
          can('read', 'Strategy');
          can('read', 'CheckIn');
          break;

        case 'viewer':
          can('read', 'Task', { productId: pid } as any);
          can('read', 'Strategy');
          can('read', 'CheckIn');
          break;
      }
    }

    return build();
  }
}
