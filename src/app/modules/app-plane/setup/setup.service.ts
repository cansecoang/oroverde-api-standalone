import { Injectable, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Product } from '../products/entities/product.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';
import { Country } from '../products/entities/country.entity';
import { Catalog } from '../catalogs/entities/catalog.entity';
import { ProductFieldDefinition } from '../field-definitions/entities/product-field-definition.entity';
import { StrategicOutput } from '../strategy/entities/strategic-output.entity';
import { StrategicIndicator } from '../strategy/entities/strategic-indicator.entity';

export interface SetupArea {
  label: string;
  count: number;
  ready: boolean;
}

export interface SetupStatusResponse {
  areas: SetupArea[];
  totalReady: number;
  totalAreas: number;
  percentage: number;
}

@Injectable({ scope: Scope.REQUEST })
export class SetupService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const ds = await this.tenantConnection.getTenantConnection();

    const [
      organizations,
      members,
      countries,
      catalogs,
      fieldDefinitions,
      outputs,
      indicators,
      products,
    ] = await Promise.all([
      ds.getRepository(WorkspaceOrganization).count(),
      ds.getRepository(WorkspaceMember).count(),
      ds.getRepository(Country).count(),
      ds.getRepository(Catalog).count({ where: { isSystem: false } }),
      ds.getRepository(ProductFieldDefinition).count(),
      ds.getRepository(StrategicOutput).count(),
      ds.getRepository(StrategicIndicator).count(),
      ds.getRepository(Product).count(),
    ]);

    const areas: SetupArea[] = [
      { label: 'Organizations',       count: organizations,    ready: organizations > 0   },
      { label: 'Team Members',        count: members,          ready: members > 0         },
      { label: 'Countries',           count: countries,        ready: countries > 0       },
      { label: 'Catalogs',            count: catalogs,         ready: catalogs > 0        },
      { label: 'Custom Fields',       count: fieldDefinitions, ready: fieldDefinitions > 0},
      { label: 'Strategic Outputs',   count: outputs,          ready: outputs > 0         },
      { label: 'Strategic Indicators',count: indicators,       ready: indicators > 0      },
      { label: 'Products',            count: products,         ready: products > 0        },
    ];

    const totalReady = areas.filter((a) => a.ready).length;

    return {
      areas,
      totalReady,
      totalAreas: areas.length,
      percentage: Math.round((totalReady / areas.length) * 100),
    };
  }
}
