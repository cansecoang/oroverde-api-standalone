import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '../../common/enums/global-roles.enum';
import { GlobalUser } from './users/entities/user.entity';
import { GlobalOrganization } from './organizations/entities/global-organization.entity';
import { Tenant } from './tenants/entities/tenant.entity';

@ApiTags('Admin - Dashboard')
@ApiCookieAuth()
@Controller('admin') 
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class ControlPlaneController {

  constructor(
    @InjectRepository(GlobalUser, 'default')
    private readonly usersRepo: Repository<GlobalUser>,
    @InjectRepository(GlobalOrganization, 'default')
    private readonly orgsRepo: Repository<GlobalOrganization>,
    @InjectRepository(Tenant, 'default')
    private readonly tenantsRepo: Repository<Tenant>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard del Control Plane', description: 'Verifica que el Control Plane está activo (solo SuperAdmin)' })
  @ApiResponse({ status: 200, description: 'Control Plane activo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado (requiere SuperAdmin)' })
  dashboard() {
    return { message: 'Control Plane activo', timestamp: new Date() };
  }

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Dashboard statistics', description: 'Returns aggregated system statistics for the control-plane dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard stats returned' })
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalOrganizations,
      totalTenants,
      activeTenants,
      suspendedTenants,
      archivedTenants,
    ] = await Promise.all([
      this.usersRepo.count(),
      this.usersRepo.count({ where: { isActive: true } }),
      this.orgsRepo.count(),
      this.tenantsRepo.count(),
      this.tenantsRepo.count({ where: { status: 'ACTIVE' as any } }),
      this.tenantsRepo.count({ where: { status: 'SUSPENDED' as any } }),
      this.tenantsRepo.count({ where: { status: 'ARCHIVED' as any } }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      organizations: {
        total: totalOrganizations,
      },
      tenants: {
        total: totalTenants,
        active: activeTenants,
        suspended: suspendedTenants,
        archived: archivedTenants,
      },
    };
  }
}