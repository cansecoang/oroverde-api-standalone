import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StrategyService } from './strategy.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';
import { CreateOutputDto } from './dto/create-output.dto';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { AssignStrategyDto } from './dto/assign-strategy.dto';
import { ReportProgressDto } from './dto/report-progress.dto';
import { UpdateStrategyTargetDto } from './dto/update-strategy-target.dto';
import { StrategyTimelineQueryDto } from './dto/strategy-timeline-query.dto';
import { StrategyTimelineResponseDto } from './dto/strategy-timeline-response.dto';

@ApiTags('Strategy')
@ApiCookieAuth()
@Controller('strategy')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class StrategyController {
  constructor(private readonly service: StrategyService) {}

  @Post('outputs')
  @RequirePermission(Permission.STRATEGY_GLOBAL_WRITE)
  @ApiOperation({ summary: 'Crear output estratégico (solo Coordinador General)' })
  @ApiResponse({ status: 201, description: 'Output creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createOutput(@Body() dto: CreateOutputDto) {
    return this.service.createOutput(dto);
  }

  @Post('indicators')
  @RequirePermission(Permission.STRATEGY_GLOBAL_WRITE)
  @ApiOperation({ summary: 'Crear indicador estratégico (solo Coordinador General)' })
  @ApiResponse({ status: 201, description: 'Indicador creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  createIndicator(@Body() dto: CreateIndicatorDto) {
    return this.service.createIndicator(dto);
  }

  @Post('assign')
  @RequirePermission(Permission.STRATEGY_WRITE)
  @ApiOperation({ summary: 'Asignar indicador a producto' })
  @ApiResponse({ status: 201, description: 'Indicador asignado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  assign(@Body() dto: AssignStrategyDto) {
    return this.service.assignToProject(dto);
  }

  @Post('report')
  @RequirePermission(Permission.STRATEGY_WRITE)
  @ApiOperation({ summary: 'Reportar avance' })
  @ApiResponse({ status: 201, description: 'Avance reportado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  report(@Body() dto: ReportProgressDto) {
    return this.service.reportProgress(dto);
  }

  @Patch('project/:productId/assignments/:assignmentId/target')
  @RequirePermission(Permission.STRATEGY_WRITE)
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
  @RequirePermission(Permission.STRATEGY_READ)
  @ApiOperation({ summary: 'Obtener árbol estratégico completo' })
  @ApiResponse({ status: 200, description: 'Árbol estratégico' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTree() {
    return this.service.getFullStrategyTree();
  }

  @Get('timeline')
  @RequirePermission(Permission.STRATEGY_READ)
  @ApiOperation({ summary: 'Obtener timeline consolidado de indicadores' })
  @ApiResponse({
    status: 200,
    description: 'Timeline consolidado por indicador → workpackage → producto → tareas',
    type: StrategyTimelineResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTimeline(@Query() query: StrategyTimelineQueryDto) {
    return this.service.getIndicatorTimeline(query);
  }

  @Get('project/:productId')
  @RequirePermission(Permission.STRATEGY_READ)
  @ApiOperation({ summary: 'Obtener matriz estratégica del producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Matriz estratégica del producto' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  getProjectMatrix(@Param('productId', ParseUUIDPipe) id: string) {
    return this.service.findProjectStrategy(id);
  }
}