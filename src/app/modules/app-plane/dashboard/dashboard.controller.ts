import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';

import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Tenant - Dashboard')
@ApiCookieAuth()
@Controller('dashboard')
@UseGuards(AuthenticatedGuard, TenantAccessGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Tenant dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats returned' })
  async getStats() {
    return this.dashboardService.getStats();
  }
}
