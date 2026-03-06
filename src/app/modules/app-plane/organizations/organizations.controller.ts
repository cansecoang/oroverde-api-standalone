import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';
// DTOs
import { CreateWorkspaceOrganizationDto } from './dto/create-workspace-organization.dto';
import { LinkGlobalOrganizationDto } from './dto/link-global-organization.dto';

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

  // --- 📝 CREACIÓN MANUAL (Alternativa) ---
  @Post()
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Crear organización manual' })
  @ApiResponse({ status: 201, description: 'Organización creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateWorkspaceOrganizationDto) {
    return this.service.createManual(dto);
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