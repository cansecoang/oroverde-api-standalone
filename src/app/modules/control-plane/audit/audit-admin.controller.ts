import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';
import { AuditAdminService } from './audit-admin.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('admin/audit-logs')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class AuditAdminController {
  constructor(private readonly auditAdminService: AuditAdminService) {}

  /** GET /admin/audit-logs/control-plane */
  @Get('control-plane')
  getControlPlaneLogs(@Query() filters: AuditQueryDto) {
    return this.auditAdminService.getControlPlaneLogs(filters);
  }

  /** GET /admin/audit-logs/app-plane?tenantSlug=xxx */
  @Get('app-plane')
  getAppPlaneLogs(
    @Query('tenantSlug') tenantSlug: string,
    @Query() filters: AuditQueryDto,
  ) {
    return this.auditAdminService.getAppPlaneLogs(tenantSlug, filters);
  }
}
