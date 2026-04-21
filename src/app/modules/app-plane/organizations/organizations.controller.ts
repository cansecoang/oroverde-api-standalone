import { Controller, Post, Patch, Delete, Body, Get, Param, Query, UseGuards, ParseUUIDPipe, Request } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';
// DTOs
import { LinkGlobalOrganizationDto } from './dto/link-global-organization.dto';
import { UpdateWorkspaceOrganizationDto } from './dto/update-workspace-organization.dto';

@ApiTags('Organizations')
@ApiCookieAuth()
@Controller('organizations')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  // --- 🌍 BÚSQUEDA GLOBAL (Paso 1 del Frontend) ---
  @Get('global-search')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Buscar organizaciones globales' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Término de búsqueda' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  searchGlobal(@Query('q') query: string) {
    return this.service.searchGlobal(query || '');
  }

  // --- 🔗 VINCULACIÓN (Paso 2 del Frontend) ---
  @Post('link-global')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Vincular organización global al workspace' })
  @ApiResponse({ status: 201, description: 'Organización vinculada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  linkGlobal(@Body() dto: LinkGlobalOrganizationDto) {
    return this.service.linkFromGlobal(dto.globalId);
  }

  // --- ✏️ ACTUALIZAR ORGANIZACIÓN ---
  @Patch(':id')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Actualizar tipo de organización del workspace' })
  @ApiResponse({ status: 200, description: 'Organización actualizada' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkspaceOrganizationDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, req.workspaceMember?.id);
  }

  // --- 🗑 DESVINCULAR ORGANIZACIÓN ---
  @Delete(':id')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Desvincular organización del workspace' })
  @ApiResponse({ status: 200, description: 'Organización desvinculada exitosamente' })
  @ApiResponse({ status: 400, description: 'No se puede desvincular la organización propietaria' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  @ApiResponse({ status: 409, description: 'Conflicto: la organización tiene productos o miembros asociados' })
  unlink(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.service.unlink(id, req.workspaceMember?.id);
  }

  // --- 📂 LISTADO LOCAL (Para Dropdowns en Proyectos) ---
  @Get()
  @RequirePermission(Permission.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Listar organizaciones del workspace' })
  @ApiResponse({ status: 200, description: 'Lista de organizaciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll() {
    return this.service.findAll();
  }
}
