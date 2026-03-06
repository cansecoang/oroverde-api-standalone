import { Controller, Post, Get, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProductMembersService } from './product-members.service';
import { AddProductMemberDto } from './dto/add-product-member.dto';
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
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  addMember(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: AddProductMemberDto) {
    return this.service.addMember(productId, dto);
  }

  @Get()
  @RequirePermission(Permission.PRODUCT_MEMBER_READ)
  @ApiOperation({ summary: 'Listar equipo del producto' })
  @ApiParam({ name: 'productId', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Lista de miembros del equipo' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getTeam(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.getProjectTeam(productId);
  }
}
