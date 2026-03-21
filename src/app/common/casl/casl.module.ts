import { Module } from '@nestjs/common';
import { AbilityFactory } from './ability.factory';
import { PoliciesGuard } from '../guards/policies.guard';

// TenancyModule es @Global() — TENANT_CONNECTION_TOKEN, WORKSPACE_MEMBER_ENTITY
// y PRODUCT_MEMBER_ENTITY ya están disponibles sin importarlo aquí.

@Module({
  providers: [AbilityFactory, PoliciesGuard],
  exports: [AbilityFactory, PoliciesGuard],
})
export class CaslModule {}
