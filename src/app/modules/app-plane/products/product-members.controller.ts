import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ProductMembersService } from './product-members.service';
import { AddProductMemberDto } from './dto/add-product-member.dto';
import { UpdateProductMemberDto } from './dto/update-product-member.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { Permission } from '../../../common/enums/business-roles.enum';

@ApiTags('Product Members')
@ApiCookieAuth()
@Controller('products/:productId/members')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class ProductMembersController {
  constructor(private readonly service: ProductMembersService) {}

  @Post()
  @RequirePermission(Permission.PRODUCT_MEMBER_MANAGE)
  @ApiOperation({ summary: 'Agregar miembro al producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 201, description: 'Miembro agregado exitosamente' })
  @ApiResponse({ status: 400, description: 'El miembro ya pertenece al producto' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Workspace member no encontrado' })
  addMember(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AddProductMemberDto,
    @Request() req,
  ) {
    return this.service.addMember(productId, dto, req.workspaceMember?.id);
  }

  @Get()
  @RequirePermission(Permission.PRODUCT_MEMBER_READ)
  @ApiOperation({ summary: 'Listar equipo del producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Lista de miembros del equipo' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getTeam(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.getProjectTeam(productId);
  }

  @Patch(':memberId')
  @RequirePermission(Permission.PRODUCT_MEMBER_MANAGE)
  @ApiOperation({ summary: 'Cambiar rol, dedicación o responsabilidad de un miembro' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiParam({ name: 'memberId', type: String, description: 'UUID de la membresía (ProductMember.id)' })
  @ApiResponse({ status: 200, description: 'Membresía actualizada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Membresía no encontrada' })
  updateMember(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateProductMemberDto,
    @Request() req,
  ) {
    return this.service.updateMember(productId, memberId, dto, req.workspaceMember?.id);
  }

  @Delete(':memberId')
  @RequirePermission(Permission.PRODUCT_MEMBER_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover miembro del producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiParam({ name: 'memberId', type: String, description: 'UUID de la membresía (ProductMember.id)' })
  @ApiResponse({ status: 204, description: 'Miembro removido' })
  @ApiResponse({ status: 400, description: 'No se puede remover por dependencias activas (ej. check-ins)' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Membresía no encontrada' })
  removeMember(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Request() req,
  ) {
    return this.service.removeMember(productId, memberId, req.workspaceMember?.id);
  }
}
