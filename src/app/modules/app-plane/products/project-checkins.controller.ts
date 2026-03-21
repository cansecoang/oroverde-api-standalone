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
import { subject } from '@casl/ability';
import { ProjectCheckInsService } from './project-checkins.service';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { UpdateCheckInDto } from './dto/update-checkin.dto';
import { CompleteCheckInDto } from './dto/complete-checkin.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';

@ApiTags('Check-ins')
@ApiCookieAuth()
@Controller('checkins')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class ProjectCheckInsController {
  constructor(private readonly service: ProjectCheckInsService) {}

  @Get('product/:productId')
  @CheckPolicies((ability) => ability.can('read', 'CheckIn'))
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

  @Get('my')
  @CheckPolicies((ability) => ability.can('read', 'CheckIn'))
  @ApiOperation({ summary: 'Próximos check-ins del usuario (todos los productos)' })
  getMyUpcomingCheckins(@Request() req) {
    return this.service.getMyUpcomingCheckins(req.workspaceMember?.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'CheckIn'))
  @ApiOperation({ summary: 'Obtener check-in por ID' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @CheckPolicies((ability, req) =>
    ability.can('create', subject('CheckIn', { productId: req.body.productId }))
  )
  @ApiOperation({ summary: 'Programar check-in' })
  @ApiResponse({ status: 201, description: 'Check-in programado exitosamente' })
  create(@Body() dto: CreateCheckInDto, @Request() req) {
    return this.service.schedule(dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  // PATCH /:id — sin productId en el request.
  // Verificación condition-less: el usuario puede update en ALGÚN check-in.
  // El servicio valida ownership específico.
  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'CheckIn'))
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

  // PATCH /:id/complete — sin productId en el request.
  @Patch(':id/complete')
  @CheckPolicies((ability) => ability.can('update', 'CheckIn'))
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

  // DELETE /:id — sin productId en el request.
  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'CheckIn'))
  @ApiOperation({ summary: 'Eliminar check-in' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.service.remove(id, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }
}
