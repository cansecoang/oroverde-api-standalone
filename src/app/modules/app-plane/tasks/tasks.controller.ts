import { Controller, Post, Patch, Body, Param, Get, UseGuards, ParseUUIDPipe, Request, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';

@ApiTags('Tasks')
@ApiCookieAuth()
@Controller('tasks')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Post()
  @RequirePermission(Permission.TASK_WRITE)
  @ApiOperation({ summary: 'Crear tarea' })
  @ApiResponse({ status: 201, description: 'Tarea creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreateTaskDto) {
    return this.service.create(dto);
  }

  @Patch(':id/status')
  @RequirePermission(Permission.TASK_UPDATE_STATUS)
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

  @Patch(':id')
  @RequirePermission(Permission.TASK_UPDATE)
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

  @Get('project/:productId')
  @RequirePermission(Permission.TASK_READ)
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