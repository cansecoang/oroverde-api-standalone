import { Injectable, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Product } from '../products/entities/product.entity';
import { Task } from '../tasks/entities/task.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';

@Injectable({ scope: Scope.REQUEST })
export class DashboardService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  async getStats() {
    const ds = await this.tenantConnection.getTenantConnection();

    const [totalProducts, totalTasks, totalMembers, totalOrganizations] =
      await Promise.all([
        ds.getRepository(Product).count(),
        ds.getRepository(Task).count(),
        ds.getRepository(WorkspaceMember).count(),
        ds.getRepository(WorkspaceOrganization).count(),
      ]);

    // Task breakdown by completion (tasks with actualEndDate are "done")
    const completedTasks = await ds
      .getRepository(Task)
      .createQueryBuilder('t')
      .where('t.actualEndDate IS NOT NULL')
      .getCount();

    return {
      products: { total: totalProducts },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
      },
      members: { total: totalMembers },
      organizations: { total: totalOrganizations },
    };
  }
}
