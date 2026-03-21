import { Controller, Get, Post, Patch, Body, Param, UseGuards, Query, Req, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { WorkspaceMembersService } from './workspace-members.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';

@ApiTags('Members')
@ApiCookieAuth()
@Controller('members')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class WorkspaceMembersController {
  constructor(private readonly service: WorkspaceMembersService) {}

  /**
   * Sin @CheckPolicies → cualquier miembro del tenant puede consultarse a sí mismo.
   * TenantAccessGuard ya verificó la membresía.
   */
  @Get('me')
  @ApiOperation({ summary: 'Mi perfil como miembro del workspace' })
  @ApiResponse({ status: 200, description: 'Perfil del miembro activo' })
  @ApiResponse({ status: 404, description: 'No eres miembro de este workspace' })
  myProfile(@Req() req: any) {
    return this.service.findMyProfile(req.user.id);
  }

  @Post('invite')
  @CheckPolicies((ability) => ability.can('manage', 'WorkspaceMember'))
  @ApiOperation({ summary: 'Invitar miembro al workspace' })
  @ApiResponse({ status: 201, description: 'Invitación enviada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 409, description: 'El miembro ya existe' })
  invite(@Body() dto: InviteMemberDto, @Req() req: any) {
    return this.service.inviteMember(dto, req.workspaceMember?.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'WorkspaceMember'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar rol o alias de un miembro del workspace' })
  @ApiParam({ name: 'id', description: 'UUID del workspace member' })
  @ApiResponse({ status: 200, description: 'Miembro actualizado correctamente' })
  @ApiResponse({ status: 404, description: 'Miembro no encontrado' })
  @ApiResponse({ status: 403, description: 'Sin permisos para gestionar miembros' })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: any,
  ) {
    return this.service.updateMember(id, dto, req.workspaceMember?.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'WorkspaceMember'))
  @ApiOperation({ summary: 'Listar miembros del workspace' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página' })
  @ApiResponse({ status: 200, description: 'Lista de miembros' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.service.findAll(+page, +limit);
  }
}
