/**
 * APP_PLANE_ENTITIES
 *
 * Lista central de todas las entidades del App-Plane.
 * Usada por TenantsService para inicializar la BD silo del tenant nuevo.
 *
 * A medida que cada dominio se migre a su propia lib de Nx, se sustituye
 * la ruta relativa por el import del barril correspondiente.
 */

import { WorkspaceMember }        from './members/entities/workspace-member.entity';
import { Product }                from './products/entities/product.entity';
import { ProductMember }          from './products/entities/product-member.entity';
import { ProductCustomOrgLink }    from './products/entities/product-custom-org-link.entity';
import { ProductCustomValue }      from './products/entities/product-custom-value.entity';
import { ProjectCheckIn }         from './products/entities/project-checkin.entity';
import { ProductFieldDefinition } from './field-definitions/entities/product-field-definition.entity';
import { Task }                   from './tasks/entities/task.entity';
import { AuditLog }               from './audit/entities/audit-log.entity';
import { StrategicOutput }        from './strategy/entities/strategic-output.entity';
import { StrategicIndicator }     from './strategy/entities/strategic-indicator.entity';
import { ProductStrategy }        from './strategy/entities/product-strategy.entity';
import { StrategyValue }          from './strategy/entities/strategy-value.entity';
import { WorkspaceOrganization }  from './organizations/entities/workspace-organization.entity';
import { Country }                from './products/entities/country.entity';

// Catálogos (consolidados en apps/api)
import { Catalog }     from './catalogs/entities/catalog.entity';
import { CatalogItem } from './catalogs/entities/catalog-item.entity';

export const APP_PLANE_ENTITIES = [
  WorkspaceMember,
  Product,
  ProductMember,
  ProductCustomOrgLink,
  ProductCustomValue,
  ProjectCheckIn,
  ProductFieldDefinition,
  Catalog,
  CatalogItem,
  Task,
  AuditLog,
  StrategicOutput,
  StrategicIndicator,
  ProductStrategy,
  StrategyValue,
  WorkspaceOrganization,
  Country,
] as const;
