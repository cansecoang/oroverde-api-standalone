import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProjectCheckInsService } from './project-checkins.service';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { UpdateCheckInDto } from './dto/update-checkin.dto';
import { CompleteCheckInDto } from './dto/complete-checkin.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';

@ApiTags('Check-ins')
@ApiCookieAuth()
@Controller('checkins')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class ProjectCheckInsController {
  constructor(private readonly service: ProjectCheckInsService) {}

  /** GET /checkins/product/:productId — lista de check-ins del producto */
  @Get('product/:productId')
  @RequirePermission(Permission.CHECKIN_READ)
  @ApiOperation({ summary: 'Listar check-ins de un producto (próximo, upcoming, pasados)' })
  @ApiParam({ name: 'productId', type: String })
  @ApiQuery({ name: 'pastPage', required: false, type: Number })
  @ApiQuery({ name: 'pastLimit', required: false, type: Number })
  findByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('pastPage') pastPage?: string,
    @Query('pastLimit') pastLimit?: string,
  ) {
    return this.service.findByProduct(
      productId,
      pastPage ? +pastPage : 1,
      pastLimit ? +pastLimit : 10,
    );
  }

  /** GET /checkins/my — próximos check-ins del usuario autenticado (cross-product) */
  @Get('my')
  @RequirePermission(Permission.CHECKIN_READ)
  @ApiOperation({ summary: 'Próximos check-ins del usuario (todos los productos)' })
  getMyUpcomingCheckins(@Request() req) {
    return this.service.getMyUpcomingCheckins(req.workspaceMember?.id);
  }

  /** GET /checkins/:id — detalle de un check-in */
  @Get(':id')
  @RequirePermission(Permission.CHECKIN_READ)
  @ApiOperation({ summary: 'Obtener check-in por ID' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /** POST /checkins — programar nuevo check-in */
  @Post()
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Programar check-in' })
  @ApiResponse({ status: 201, description: 'Check-in programado exitosamente' })
  create(@Body() dto: CreateCheckInDto, @Request() req) {
    return this.service.schedule(dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  /** PATCH /checkins/:id — actualizar check-in (reprogramar, editar) */
  @Patch(':id')
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Actualizar check-in' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCheckInDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  /** PATCH /checkins/:id/complete — marcar completado con minutas */
  @Patch(':id/complete')
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Completar check-in y guardar minutas' })
  @ApiParam({ name: 'id', type: String })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCheckInDto,
    @Request() req,
  ) {
    return this.service.complete(id, dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  /** DELETE /checkins/:id */
  @Delete(':id')
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Eliminar check-in' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.service.remove(id, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }
}
