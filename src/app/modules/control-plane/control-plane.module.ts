import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// --- ENTIDADES (Las tablas de la BD Maestra) ---
import { GlobalUser } from './users/entities/user.entity';
import { GlobalOrganization } from './organizations/entities/global-organization.entity';
import { GlobalCountry } from './countries/entities/country.entity';
import { Tenant } from './tenants/entities/tenant.entity';
import { TenantMember } from './tenants/entities/tenant-member.entity';

// --- SERVICIOS (La Lógica) ---
import { GlobalUsersService } from './users/users.service';
import { GlobalOrganizationsService } from './organizations/global-organizations.service';
import { TenantsService } from './tenants/tenants.service';
import { CountriesService } from './countries/countries.service';

// --- SEED: Catálogos por defecto al crear tenant ---
import { TENANT_SEED_CALLBACK } from '../../common/tokens/tenant-init.token';
import { seedDefaultCatalogs } from '../app-plane/catalogs/seeds/default-catalogs.seed';

// --- CONTROLADORES (Cada recurso con su propio controller) ---
import { ControlPlaneController } from './control-plane.controller';
import { GlobalUsersController } from './users/global-users.controller';
import { GlobalOrganizationsController } from './organizations/global-organizations.controller';
import { TenantsController } from './tenants/tenants.controller';
import { CountriesController } from './countries/countries.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [GlobalUser, GlobalOrganization, GlobalCountry, Tenant, TenantMember], 
      'default'
    ),
  ],
  controllers: [
    ControlPlaneController,        // GET /admin
    GlobalUsersController,         // /admin/users
    GlobalOrganizationsController, // /admin/organizations
    TenantsController,             // /admin/tenants
    CountriesController,           // /admin/countries
  ],
  providers: [
    GlobalUsersService, 
    GlobalOrganizationsService,
    TenantsService,
    CountriesService,
    // IoC: seed de catálogos TASK_STATUS + TASK_PHASES al crear tenant
    { provide: TENANT_SEED_CALLBACK, useValue: seedDefaultCatalogs },
  ],
  exports: [GlobalUsersService, GlobalOrganizationsService],
})
export class ControlPlaneModule {}