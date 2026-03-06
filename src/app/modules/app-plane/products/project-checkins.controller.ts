import { Controller, Post, Patch, Get, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProjectCheckInsService } from './project-checkins.service';
import { CreateCheckInDto } from './dto/create-checkin.dto';
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

  @Post()
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Programar check-in' })
  @ApiResponse({ status: 201, description: 'Check-in programado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateCheckInDto) {
    return this.service.schedule(dto);
  }

  @Get(':id')
  @RequirePermission(Permission.CHECKIN_READ)
  @ApiOperation({ summary: 'Obtener check-in por ID' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del check-in' })
  @ApiResponse({ status: 200, description: 'Check-in encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Check-in no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/complete')
  @RequirePermission(Permission.CHECKIN_WRITE)
  @ApiOperation({ summary: 'Completar check-in' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del check-in' })
  @ApiResponse({ status: 200, description: 'Check-in completado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Check-in no encontrado' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Body('notes') notes: string) {
    return this.service.complete(id, notes);
  }
}