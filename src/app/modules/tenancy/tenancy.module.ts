import { Global, Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';
import {
  TENANT_CONNECTION_TOKEN,
  WORKSPACE_MEMBER_ENTITY,
  PRODUCT_MEMBER_ENTITY,
} from '../../common/tokens/tenancy.tokens';
import { HybridPermissionsGuard } from '../../common/guards/hybrid-permissions.guard';
import { TenantAccessGuard } from '../../common/guards/tenant-access.guard';
import { WorkspaceMember } from '../app-plane/members/entities/workspace-member.entity';
import { ProductMember } from '../app-plane/products/entities/product-member.entity';

// M-1: TenantMiddleware se registra ÚNICAMENTE en AppModule para evitar doble ejecución.

@Global()
@Module({
  providers: [
    TenantConnectionService,
    { provide: TENANT_CONNECTION_TOKEN, useExisting: TenantConnectionService },
    { provide: WORKSPACE_MEMBER_ENTITY, useValue: WorkspaceMember },
    { provide: PRODUCT_MEMBER_ENTITY, useValue: ProductMember },
    HybridPermissionsGuard,
    TenantAccessGuard,
  ],
  exports: [
    TenantConnectionService,
    TENANT_CONNECTION_TOKEN,
    WORKSPACE_MEMBER_ENTITY,
    PRODUCT_MEMBER_ENTITY,
    HybridPermissionsGuard,
    TenantAccessGuard,
  ],
})
export class TenancyModule {}