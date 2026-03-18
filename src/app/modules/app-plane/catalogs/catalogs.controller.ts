import { Controller, Post, Get, Body, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';

import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';
import { CatalogType } from '../../../common/enums/catalog-type.enum';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';

@ApiTags('Catalogs')
@ApiCookieAuth()
@Controller('catalogs')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Post()
  @RequirePermission(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Crear catálogo' })
  @ApiResponse({ status: 201, description: 'Catálogo creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateCatalogDto) {
    return this.catalogsService.createCatalogWithItems(dto);
  }

  @Get()
  @RequirePermission(Permission.CATALOG_READ)
  @ApiOperation({ summary: 'Listar catálogos' })
  @ApiResponse({ status: 200, description: 'Lista de catálogos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll() {
    return this.catalogsService.findAll();
  }

  @Get('options/:type')
  @RequirePermission(Permission.CATALOG_READ)
  @ApiOperation({ summary: 'Obtener items por tipo' })
  @ApiParam({ name: 'type', type: String, description: 'Tipo de catálogo' })
  @ApiResponse({ status: 200, description: 'Items del tipo solicitado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async getOptions(@Param('type') type: CatalogType) {
    return this.catalogsService.getItemsByType(type);
  }

  @Get(':code')
  @RequirePermission(Permission.CATALOG_READ)
  @ApiOperation({ summary: 'Obtener catálogo por código' })
  @ApiParam({ name: 'code', type: String, description: 'Código del catálogo' })
  @ApiResponse({ status: 200, description: 'Catálogo encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Catálogo no encontrado' })
  findOne(@Param('code') code: string) {
    return this.catalogsService.findByCode(code);
  }
}
