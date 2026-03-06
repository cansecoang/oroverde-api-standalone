import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { GlobalOrganizationsService } from './global-organizations.service';
import { CreateGlobalOrganizationDto } from './dto/create-global-organization.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';

@ApiTags('Admin - Organizations')
@ApiCookieAuth()
@Controller('admin/organizations')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class GlobalOrganizationsController {
  constructor(private readonly service: GlobalOrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear organización global' })
  @ApiResponse({ status: 201, description: 'Organización creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(@Body() createDto: CreateGlobalOrganizationDto) {
    return this.service.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar organizaciones globales' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Término de búsqueda' })
  @ApiQuery({ name: 'simple', required: false, type: Boolean, description: 'Retornar solo id y name' })
  @ApiResponse({ status: 200, description: 'Lista de organizaciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findAll(
    @Query('q') query: string,
    @Query('simple') simple?: string,
  ) {
    if (simple === 'true') {
      return this.service.findAllSimple(query);
    }
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener organización por ID' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la organización' })
  @ApiResponse({ status: 200, description: 'Organización encontrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar organización' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la organización' })
  @ApiResponse({ status: 200, description: 'Organización actualizada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  update(@Param('id') id: string, @Body() updateDto: Partial<CreateGlobalOrganizationDto>) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar organización' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la organización' })
  @ApiResponse({ status: 200, description: 'Organización eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Organización no encontrada' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}