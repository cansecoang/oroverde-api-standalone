import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FieldDefinitionsService } from './field-definitions.service';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { UpdateFieldDefinitionDto } from './dto/update-field-definition.dto';
import { ReorderFieldDefinitionsDto } from './dto/reorder-field-definitions.dto';

import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';

@ApiTags('Field Definitions')
@ApiCookieAuth()
@Controller('field-definitions')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class FieldDefinitionsController {
  constructor(private readonly service: FieldDefinitionsService) {}

  @Post()
  @RequirePermission(Permission.FIELD_DEF_WRITE)
  @ApiOperation({ summary: 'Crear definición de campo' })
  @ApiResponse({ status: 201, description: 'Definición de campo creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateFieldDefinitionDto) {
    return this.service.createDefinition(dto);
  }

  @Get()
  @RequirePermission(Permission.FIELD_DEF_READ)
  @ApiOperation({ summary: 'Obtener template de campos' })
  @ApiResponse({ status: 200, description: 'Template de campos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTemplate() {
    return this.service.getProjectTemplate();
  }

  @Patch('reorder')
  @RequirePermission(Permission.FIELD_DEF_WRITE)
  @ApiOperation({ summary: 'Reordenar definiciones de campo' })
  @ApiResponse({ status: 200, description: 'Campos reordenados, devuelve la lista actualizada' })
  @ApiResponse({ status: 400, description: 'IDs inválidos' })
  reorder(@Body() dto: ReorderFieldDefinitionsDto) {
    return this.service.reorderDefinitions(dto.orderedIds);
  }

  @Patch(':id')
  @RequirePermission(Permission.FIELD_DEF_WRITE)
  @ApiOperation({ summary: 'Actualizar definición de campo' })
  @ApiResponse({ status: 200, description: 'Campo actualizado' })
  @ApiResponse({ status: 404, description: 'Campo no encontrado' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFieldDefinitionDto,
  ) {
    return this.service.updateDefinition(id, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.FIELD_DEF_WRITE)
  @ApiOperation({ summary: 'Eliminar definición de campo' })
  @ApiResponse({ status: 200, description: 'Campo eliminado' })
  @ApiResponse({ status: 404, description: 'Campo no encontrado' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeDefinition(id);
  }
}