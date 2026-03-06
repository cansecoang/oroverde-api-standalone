import { Controller, Get, Post, Body, UseGuards, Query, Req } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WorkspaceMembersService } from './workspace-members.service';
import { InviteMemberDto } from './dto/invite-member.dto';

import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';

@ApiTags('Members')
@ApiCookieAuth()
@Controller('members')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class WorkspaceMembersController {
  constructor(private readonly service: WorkspaceMembersService) {}

  /**
   * Devuelve el perfil del workspace member que corresponde al usuario en sesión.
   * Sin @RequirePermission → cualquier miembro del tenant puede consultarse a sí mismo.
   */
  @Get('me')
  @ApiOperation({ summary: 'Mi perfil como miembro del workspace' })
  @ApiResponse({ status: 200, description: 'Perfil del miembro activo' })
  @ApiResponse({ status: 404, description: 'No eres miembro de este workspace' })
  myProfile(@Req() req: any) {
    return this.service.findMyProfile(req.user.id);
  }

  @Post('invite')
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Invitar miembro al workspace' })
  @ApiResponse({ status: 201, description: 'Invitación enviada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 409, description: 'El miembro ya existe' })
  invite(@Body() dto: InviteMemberDto) {
    return this.service.inviteMember(dto);
  }

  @Get()
  @RequirePermission(Permission.MEMBER_READ)
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