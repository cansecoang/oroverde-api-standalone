import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ProductRequestsService } from './product-requests.service';
import { SubmitProductRequestDto } from './dto/submit-product-request.dto';
import { ReviewProductRequestDto } from './dto/review-product-request.dto';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';
import { Permission } from '../../../common/enums/business-roles.enum';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

@ApiTags('ProductRequests')
@ApiCookieAuth()
@Controller('product-requests')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class ProductRequestsController {
  constructor(private readonly productRequestsService: ProductRequestsService) {}

  @Post()
  @RequirePermission(Permission.PRODUCT_REQUEST_WRITE)
  @ApiOperation({ summary: 'Enviar solicitud de creación de producto (DEVELOPER_WORKER)' })
  @ApiResponse({ status: 201, description: 'Solicitud creada en estado PENDING' })
  @ApiResponse({ status: 400, description: 'El nombre del producto ya existe o datos inválidos' })
  @ApiResponse({ status: 403, description: 'No autorizado — solo DEVELOPER_WORKER puede solicitar' })
  submitRequest(@Body() dto: SubmitProductRequestDto, @Request() req) {
    return this.productRequestsService.submitRequest(dto, req.workspaceMember.id);
  }

  @Get()
  @RequirePermission(Permission.PRODUCT_REQUEST_REVIEW)
  @ApiOperation({ summary: 'Listar solicitudes de creación (revisores: GC o PC)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'DECLINED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista paginada de solicitudes' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  listRequests(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.productRequestsService.listRequests({
      status,
      page: +page,
      limit: +limit,
    });
  }

  @Get('pending-count')
  @RequirePermission(Permission.PRODUCT_REQUEST_REVIEW)
  @ApiOperation({ summary: 'Cantidad de solicitudes en estado PENDING (para badge de revisores)' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { count: { type: 'number' } } } })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getPendingCount() {
    return this.productRequestsService.getPendingCount();
  }

  @Patch(':id/review')
  @RequirePermission(Permission.PRODUCT_REQUEST_REVIEW)
  @ApiOperation({ summary: 'Aprobar o rechazar una solicitud de creación (GC o PC)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud procesada; si fue aprobada el producto fue creado' })
  @ApiResponse({ status: 400, description: 'La solicitud ya fue procesada' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  reviewRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewProductRequestDto,
    @Request() req,
  ) {
    return this.productRequestsService.reviewRequest(id, dto, req.workspaceMember.id);
  }
}
