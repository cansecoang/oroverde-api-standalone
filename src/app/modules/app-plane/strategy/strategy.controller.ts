import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { subject } from '@casl/ability';
import { StrategyService } from './strategy.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CreateOutputDto } from './dto/create-output.dto';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { UpdateOutputDto } from './dto/update-output.dto';
import { AssignStrategyDto } from './dto/assign-strategy.dto';
import { ReportProgressDto } from './dto/report-progress.dto';
import { UpdateStrategyTargetDto } from './dto/update-strategy-target.dto';
import { StrategyTimelineQueryDto } from './dto/strategy-timeline-query.dto';
import { StrategyTimelineResponseDto } from './dto/strategy-timeline-response.dto';

@ApiTags('Strategy')
@ApiCookieAuth()
@Controller('strategy')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class StrategyController {
  constructor(private readonly service: StrategyService) {}

  // globalWrite → solo GENERAL_COORDINATOR (GC tiene manage('Strategy') que cubre esta acción)
  @Post('outputs')
  @CheckPolicies((ability) => ability.can('globalWrite', 'Strategy'))
  @ApiOperation({ summary: 'Crear output estratégico (solo Coordinador General)' })
  @ApiResponse({ status: 201, description: 'Output creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createOutput(@Body() dto: CreateOutputDto) {
    return this.service.createOutput(dto);
  }

  @Post('indicators')
  @CheckPolicies((ability) => ability.can('globalWrite', 'Strategy'))
  @ApiOperation({ summary: 'Crear indicador estratégico (solo Coordinador General)' })
  @ApiResponse({ status: 201, description: 'Indicador creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createIndicator(@Body() dto: CreateIndicatorDto) {
    return this.service.createIndicator(dto);
  }

  @Patch('outputs/:id')
  @CheckPolicies((ability) => ability.can('globalWrite', 'Strategy'))
  @ApiOperation({ summary: 'Actualizar output estratégico' })
  @ApiParam({ name: 'id', type: String })
  updateOutput(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutputDto,
  ) {
    return this.service.updateOutput(id, dto);
  }

  @Patch('indicators/:id')
  @CheckPolicies((ability) => ability.can('globalWrite', 'Strategy'))
  @ApiOperation({ summary: 'Actualizar indicador estratégico' })
  @ApiParam({ name: 'id', type: String })
  updateIndicator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIndicatorDto,
  ) {
    return this.service.updateIndicator(id, dto);
  }

  @Post('assign')
  @CheckPolicies((ability, req) =>
    ability.can('write', subject('Strategy', { productId: req.body.productId }))
  )
  @ApiOperation({ summary: 'Asignar indicador a producto' })
  @ApiResponse({ status: 201, description: 'Indicador asignado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  assign(@Body() dto: AssignStrategyDto) {
    return this.service.assignToProject(dto);
  }

  @Post('report')
  @CheckPolicies((ability, req) =>
    ability.can('write', subject('Strategy', { productId: req.body.productId }))
  )
  @ApiOperation({ summary: 'Reportar avance' })
  @ApiResponse({ status: 201, description: 'Avance reportado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  report(@Body() dto: ReportProgressDto) {
    return this.service.reportProgress(dto);
  }

  @Patch('project/:productId/assignments/:assignmentId/target')
  @CheckPolicies((ability, req) =>
    ability.can('write', subject('Strategy', { productId: req.params.productId }))
  )
  @ApiOperation({ summary: 'Actualizar meta comprometida de una asignación estratégica' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiParam({ name: 'assignmentId', type: String, description: 'UUID de la asignación producto-indicador' })
  @ApiResponse({ status: 200, description: 'Meta comprometida actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'La nueva meta es inválida' })
  @ApiResponse({ status: 404, description: 'Asignación no encontrada' })
  updateCommittedTarget(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateStrategyTargetDto,
  ) {
    return this.service.updateCommittedTarget(productId, assignmentId, dto.target);
  }

  @Get('tree')
  @CheckPolicies((ability) => ability.can('read', 'Strategy'))
  @ApiOperation({ summary: 'Obtener árbol estratégico completo' })
  @ApiResponse({ status: 200, description: 'Árbol estratégico' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTree() {
    return this.service.getFullStrategyTree();
  }

  @Get('timeline')
  @CheckPolicies((ability) => ability.can('read', 'Strategy'))
  @ApiOperation({ summary: 'Obtener timeline consolidado de indicadores' })
  @ApiResponse({ status: 200, description: 'Timeline consolidado', type: StrategyTimelineResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTimeline(@Query() query: StrategyTimelineQueryDto) {
    return this.service.getIndicatorTimeline(query);
  }

  @Get('project/:productId')
  @CheckPolicies((ability) => ability.can('read', 'Strategy'))
  @ApiOperation({ summary: 'Obtener matriz estratégica del producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Matriz estratégica del producto' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  getProjectMatrix(@Param('productId', ParseUUIDPipe) id: string) {
    return this.service.findProjectStrategy(id);
  }
}
