import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TenantCountriesService } from './tenant-countries.service';
import { AddTenantCountryDto } from './dto/add-tenant-country.dto';
import { BulkAddTenantCountriesDto } from './dto/bulk-add-tenant-countries.dto';

import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';

@ApiTags('Countries (Tenant)')
@ApiCookieAuth()
@Controller('countries')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class TenantCountriesController {
  constructor(private readonly countriesService: TenantCountriesService) {}

  // ─── LECTURA ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar países habilitados en este tenant' })
  @ApiResponse({ status: 200, description: 'Lista de países configurados para este workspace' })
  findAll() {
    return this.countriesService.findAllTenant();
  }

  @Get('global')
  @ApiOperation({ summary: 'Listar TODOS los países disponibles (catálogo global)' })
  @ApiResponse({ status: 200, description: 'Lista completa de países ISO 3166-1 con timezone y región' })
  findAllGlobal() {
    return this.countriesService.findAllGlobal();
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Países sugeridos basados en las organizaciones participantes del tenant',
    description:
      'Detecta países de las organizaciones registradas en el tenant que aún no están habilitados como ámbito operacional. ' +
      'No auto-aplica los cambios — el admin decide qué agregar usando POST /countries/bulk.',
  })
  @ApiResponse({ status: 200, description: 'Lista de países sugeridos + mensaje explicativo' })
  getSuggestions() {
    return this.countriesService.getSuggestions();
  }

  // ─── ESCRITURA ───────────────────────────────────────────────────────

  @Post()
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Agregar un país al tenant desde el catálogo global' })
  @ApiResponse({ status: 201, description: 'País agregado al tenant' })
  @ApiResponse({ status: 404, description: 'País no encontrado en catálogo global' })
  @ApiResponse({ status: 400, description: 'País ya existe en este tenant' })
  addCountry(@Body() dto: AddTenantCountryDto, @Request() req: any) {
    return this.countriesService.addCountry(dto.code, req.workspaceMember?.id);
  }

  @Post('bulk')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Agregar múltiples países al tenant de una sola vez' })
  @ApiResponse({ status: 201, description: 'Resultado del bulk: added, skipped, notFound' })
  bulkAddCountries(@Body() dto: BulkAddTenantCountriesDto, @Request() req: any) {
    return this.countriesService.bulkAddCountries(dto.codes, req.workspaceMember?.id);
  }

  @Delete(':code')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Eliminar un país del tenant' })
  @ApiParam({ name: 'code', description: 'Código ISO 3166-1 alpha-2', example: 'MX' })
  @ApiResponse({ status: 200, description: 'País eliminado del tenant' })
  @ApiResponse({ status: 404, description: 'País no encontrado en este tenant' })
  @ApiResponse({ status: 400, description: 'No se puede eliminar — hay productos que lo referencian' })
  removeCountry(@Param('code') code: string, @Request() req: any) {
    return this.countriesService.removeCountry(code, req.workspaceMember?.id);
  }
}
