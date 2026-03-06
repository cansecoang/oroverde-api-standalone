import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
// Controllers
import { ProductsController } from './products/products.controller';
import { FieldDefinitionsController } from './field-definitions/field-definitions.controller';
import { TasksController } from './tasks/tasks.controller';                     // 👈 Nuevo
import { TenantCountriesController } from './countries/tenant-countries.controller'; // 👈 Países

// Services
import { ProductsService } from './products/products.service';
import { FieldDefinitionsService } from './field-definitions/field-definitions.service';
import { TasksService } from './tasks/tasks.service';                     // 👈 Nuevo
import { TenantCountriesService } from './countries/tenant-countries.service'; // 👈 Países
import { TypeOrmModule } from '@nestjs/typeorm'; // 👈 1. IMPORTAR ESTO
import { ProductFieldDefinition } from './field-definitions/entities/product-field-definition.entity';
import { Product } from './products/entities/product.entity';
import { ProductMember } from './products/entities/product-member.entity';
import { ProductCustomOrgLink } from './products/entities/product-custom-org-link.entity';
import { ProductCustomCatalogLink } from './products/entities/product-custom-catalog-link.entity';
import { StrategyValue } from './strategy/entities/strategy-value.entity';
import { ProductStrategy } from './strategy/entities/product-strategy.entity';
import { StrategicIndicator } from './strategy/entities/strategic-indicator.entity';
import { StrategicOutput } from './strategy/entities/strategic-output.entity';
import { StrategyController } from './strategy/strategy.controller';
import { StrategyService } from './strategy/strategy.service';
import { WorkspaceMembersController } from './members/workspace-members.controller';
import { WorkspaceMembersService } from './members/workspace-members.service';
import { OrganizationsController } from './organizations/organizations.controller';
import { OrganizationsService } from './organizations/organizations.service';
import { WorkspaceOrganization } from './organizations/entities/workspace-organization.entity';
import { WorkspaceMember } from './members/entities/workspace-member.entity';
import { Task } from './tasks/entities/task.entity';
import { AuditLog } from './audit/entities/audit-log.entity';
import { ProductMembersController } from './products/product-members.controller';
import { ProductMembersService } from './products/product-members.service';
import { ProjectCheckInsController } from './products/project-checkins.controller';
import { ProjectCheckInsService } from './products/project-checkins.service';
import { ProjectCheckIn } from './products/entities/project-checkin.entity';
import { Country } from './products/entities/country.entity';
import { CatalogsModule } from './catalogs/catalogs.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { SetupController } from './setup/setup.controller';
import { SetupService } from './setup/setup.service';

@Module({
  imports: [
    TenancyModule,
    TypeOrmModule.forFeature([
      ProductFieldDefinition,
      Product,
      ProductMember,
      ProductCustomOrgLink,
      ProductCustomCatalogLink,
      StrategicOutput,
      StrategicIndicator,
      ProductStrategy,
      StrategyValue,
      WorkspaceOrganization,
      WorkspaceMember,
      Task,
      AuditLog,
      ProjectCheckIn,
      Country,
    ]),
    CatalogsModule,
  ],
  controllers: [
    ProductsController,
    ProductMembersController,
    ProjectCheckInsController,
    FieldDefinitionsController,
    TasksController,
    StrategyController,
    WorkspaceMembersController,
    OrganizationsController,
    TenantCountriesController,
    DashboardController,
    SetupController,
],
  providers: [
    ProductsService,
    ProductMembersService,
    ProjectCheckInsService,
    FieldDefinitionsService,
    TasksService,
    StrategyService,
    WorkspaceMembersService,
    OrganizationsService,
    TenantCountriesService,
    DashboardService,
    SetupService,
],
})
export class AppPlaneModule {}
