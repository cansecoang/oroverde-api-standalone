import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { CreateGlobalCountryDto } from './dto/create-global-country.dto';
import { UpdateGlobalCountryDto } from './dto/update-global-country.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';

@ApiTags('Admin - Countries')
@ApiCookieAuth()
@Controller('admin/countries')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los países globales' })
  @ApiResponse({ status: 200, description: 'Lista de países ISO 3166-1 con timezone y región' })
  findAll() {
    return this.countriesService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Obtener un país por código ISO' })
  @ApiParam({ name: 'code', description: 'Código ISO 3166-1 alpha-2', example: 'MX' })
  findByCode(@Param('code') code: string) {
    return this.countriesService.findByCode(code);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo país en el catálogo global' })
  @ApiResponse({ status: 201, description: 'País creado' })
  @ApiResponse({ status: 409, description: 'Ya existe un país con ese código' })
  create(@Body() dto: CreateGlobalCountryDto) {
    return this.countriesService.create(dto);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Sembrar todos los países del mundo (ISO 3166-1)' })
  @ApiResponse({ status: 201, description: 'Países sembrados/actualizados exitosamente' })
  seedAll() {
    return this.countriesService.seedAll();
  }

  @Put(':code')
  @ApiOperation({ summary: 'Actualizar un país existente' })
  @ApiParam({ name: 'code', description: 'Código ISO 3166-1 alpha-2', example: 'MX' })
  update(@Param('code') code: string, @Body() dto: UpdateGlobalCountryDto) {
    return this.countriesService.update(code, dto);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Eliminar un país del catálogo global' })
  @ApiParam({ name: 'code', description: 'Código ISO 3166-1 alpha-2', example: 'MX' })
  remove(@Param('code') code: string) {
    return this.countriesService.remove(code);
  }
}

