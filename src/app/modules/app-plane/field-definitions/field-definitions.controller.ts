import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FieldDefinitionsService } from './field-definitions.service';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { UpdateFieldDefinitionDto } from './dto/update-field-definition.dto';
import { ReorderFieldDefinitionsDto } from './dto/reorder-field-definitions.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';

@ApiTags('Field Definitions')
@ApiCookieAuth()
@Controller('field-definitions')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class FieldDefinitionsController {
  constructor(private readonly service: FieldDefinitionsService) {}

  @Post()
  @CheckPolicies((ability) => ability.can('write', 'FieldDefinition'))
  @ApiOperation({ summary: 'Crear definición de campo' })
  @ApiResponse({ status: 201, description: 'Definición de campo creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateFieldDefinitionDto) {
    return this.service.createDefinition(dto);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'FieldDefinition'))
  @ApiOperation({ summary: 'Obtener template de campos' })
  @ApiResponse({ status: 200, description: 'Template de campos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTemplate() {
    return this.service.getProjectTemplate();
  }

  @Patch('reorder')
  @CheckPolicies((ability) => ability.can('write', 'FieldDefinition'))
  @ApiOperation({ summary: 'Reordenar definiciones de campo' })
  @ApiResponse({ status: 200, description: 'Campos reordenados, devuelve la lista actualizada' })
  @ApiResponse({ status: 400, description: 'IDs inválidos' })
  reorder(@Body() dto: ReorderFieldDefinitionsDto) {
    return this.service.reorderDefinitions(dto.orderedIds);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('write', 'FieldDefinition'))
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
  @CheckPolicies((ability) => ability.can('write', 'FieldDefinition'))
  @ApiOperation({ summary: 'Eliminar definición de campo' })
  @ApiResponse({ status: 200, description: 'Campo eliminado' })
  @ApiResponse({ status: 404, description: 'Campo no encontrado' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeDefinition(id);
  }
}
