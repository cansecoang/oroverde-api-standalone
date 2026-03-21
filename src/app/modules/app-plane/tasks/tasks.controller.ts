import { Controller, Post, Patch, Delete, Body, Param, Get, UseGuards, ParseUUIDPipe, Request, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { subject } from '@casl/ability';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';

@ApiTags('Tasks')
@ApiCookieAuth()
@Controller('tasks')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Post()
  @CheckPolicies((ability, req) =>
    ability.can('create', subject('Task', { productId: req.body.productId }))
  )
  @ApiOperation({ summary: 'Crear tarea' })
  @ApiResponse({ status: 201, description: 'Tarea creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateTaskDto, @Request() req) {
    return this.service.create(dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  // PATCH /:id/status — sin productId en el request.
  // Verificación condition-less: el usuario tiene permiso de updateStatus en ALGÚN producto.
  // La validación de ownership específica la hace el servicio.
  @Patch(':id/status')
  @CheckPolicies((ability) => ability.can('updateStatus', 'Task'))
  @ApiOperation({ summary: 'Actualizar estatus de tarea' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la tarea' })
  @ApiResponse({ status: 200, description: 'Estatus actualizado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Tarea no encontrada' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @Request() req,
  ) {
    return this.service.updateStatus(id, dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  // PATCH /:id — sin productId en el request.
  // Verificación condition-less: el usuario tiene permiso de update en ALGÚN producto.
  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Task'))
  @ApiOperation({ summary: 'Actualizar tarea' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la tarea' })
  @ApiResponse({ status: 200, description: 'Tarea actualizada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Tarea no encontrada' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  // DELETE /:id — sin productId en el request.
  // Verificación condition-less: el usuario tiene permiso de delete en ALGÚN producto.
  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'Task'))
  @ApiOperation({ summary: 'Eliminar tarea' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la tarea' })
  @ApiResponse({ status: 200, description: 'Tarea eliminada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Tarea no encontrada' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    return this.service.remove(id, {
      workspaceMemberId: req.workspaceMember?.id,
      tenantRole: req.workspaceMember?.tenantRole,
    });
  }

  @Get('project/:productId')
  @CheckPolicies((ability, req) =>
    ability.can('read', subject('Task', { productId: req.params.productId }))
  )
  @ApiOperation({ summary: 'Listar tareas por producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página' })
  @ApiResponse({ status: 200, description: 'Lista de tareas del producto' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findByProject(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.service.findByProject(productId, +page, +limit);
  }
}
