import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AddTenantMemberDto } from './dto/add-tenant-member.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

@ApiTags('Admin - Tenants')
@ApiCookieAuth()
@Controller('admin/tenants')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tenants', description: 'Devuelve todos los tenants registrados (solo SuperAdmin)' })
  @ApiResponse({ status: 200, description: 'Lista de tenants' })
  findAll() {
    return this.tenantsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Crear tenant/workspace', description: 'Crea un nuevo tenant con su base de datos aislada (solo SuperAdmin)' })
  @ApiResponse({ status: 201, description: 'Tenant creado con su DB' })
  @ApiResponse({ status: 400, description: 'Datos inválidos (slug duplicado, etc.)' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(
    @Body() dto: CreateTenantDto,
    @Request() req,
  ) {
    return this.tenantsService.createTenant(dto, req.user.id);
  }

  // ─────────── H-1: Agregar miembro a un tenant ───────────

  @Post(':id/members')
  @ApiOperation({ summary: 'Agregar usuario a tenant', description: 'Agrega un usuario global existente como miembro de un tenant' })
  @ApiParam({ name: 'id', description: 'UUID del tenant' })
  @ApiResponse({ status: 201, description: 'Miembro agregado' })
  @ApiResponse({ status: 404, description: 'Tenant o usuario no encontrado' })
  @ApiResponse({ status: 400, description: 'Ya es miembro o tenant inactivo' })
  addMember(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: AddTenantMemberDto,
  ) {
    return this.tenantsService.addMemberToTenant(tenantId, dto.userId, dto.tenantRole);
  }

  // ─────────── H-4: Actualizar estado del tenant ───────────

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar estado del tenant', description: 'Actualiza el estado del tenant (ACTIVE, SUSPENDED, ARCHIVED)' })
  @ApiParam({ name: 'id', description: 'UUID del tenant' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  updateStatus(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.updateStatus(tenantId, dto.status);
  }

  // ─────────── H-4: Eliminar (archivar) tenant ───────────

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar tenant', description: 'Archiva el tenant y opcionalmente elimina su base de datos' })
  @ApiParam({ name: 'id', description: 'UUID del tenant' })
  @ApiQuery({ name: 'dropDatabase', required: false, type: Boolean, description: 'Si true, elimina la BD física permanentemente' })
  @ApiResponse({ status: 200, description: 'Tenant archivado/eliminado' })
  @ApiResponse({ status: 404, description: 'Tenant no encontrado' })
  deleteTenant(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Query('dropDatabase') dropDatabase?: string,
  ) {
    return this.tenantsService.deleteTenant(tenantId, dropDatabase === 'true');
  }
}
