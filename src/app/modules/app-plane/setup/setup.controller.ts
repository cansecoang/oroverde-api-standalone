import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { SetupService } from './setup.service';

@ApiTags('Setup')
@ApiCookieAuth()
@UseGuards(AuthenticatedGuard, TenantAccessGuard)
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get workspace setup/readiness status' })
  @ApiResponse({ status: 200, description: 'Setup status with area completion details' })
  async getStatus() {
    return this.setupService.getStatus();
  }
}
