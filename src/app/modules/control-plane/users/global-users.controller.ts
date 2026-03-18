import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, Query, Request, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { GlobalUsersService } from './users.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';
import { CreateGlobalUserDto } from './dto/create-global-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@ApiTags('Admin - Users')
@ApiCookieAuth()
@Controller('admin/users')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class GlobalUsersController {
  constructor(private readonly usersService: GlobalUsersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear usuario global' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(@Body() dto: CreateGlobalUserDto) {
    return this.usersService.create(
      dto.email,
      dto.firstName,
      dto.lastName,
      dto.orgId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios globales' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.usersService.findAll(+page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar usuario (nombre, apellido, organización)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o organización no existe' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Request() req,
  ) {
    return this.usersService.update(id, dto, req.user?.id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Cambiar rol global del usuario (super_admin / user)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  @ApiResponse({ status: 400, description: 'No puede cambiar su propio rol / último Super Admin' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @Request() req,
  ) {
    return this.usersService.updateRole(id, dto, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activar o desactivar usuario (purga sesiones si se desactiva)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'No puede desactivar su propia cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Request() req,
  ) {
    if (req.user.id === id && !dto.isActive) {
      throw new BadRequestException('No puede desactivar su propia cuenta.');
    }
    return this.usersService.updateStatus(id, dto, req.user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario (solo si está desactivado y sin workspaces)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado' })
  @ApiResponse({ status: 400, description: 'No puede eliminar su propia cuenta' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'Conflicto: usuario activo o con workspaces asociados' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    if (req.user.id === id) {
      throw new BadRequestException('No puede eliminar su propia cuenta.');
    }
    return this.usersService.remove(id, req.user?.id);
  }
}
