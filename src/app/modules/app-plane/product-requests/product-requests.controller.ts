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
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';

@ApiTags('ProductRequests')
@ApiCookieAuth()
@Controller('product-requests')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class ProductRequestsController {
  constructor(private readonly productRequestsService: ProductRequestsService) {}

  // Fix B-1: todos los MEMBER tienen create('ProductRequest') en el AbilityFactory.
  // Ya no requiere ser DEVELOPER_WORKER con asignación en un producto.
  @Post()
  @CheckPolicies((ability) => ability.can('create', 'ProductRequest'))
  @ApiOperation({ summary: 'Enviar solicitud de creación de producto' })
  @ApiResponse({ status: 201, description: 'Solicitud creada en estado PENDING' })
  @ApiResponse({ status: 400, description: 'El nombre del producto ya existe o datos inválidos' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  submitRequest(@Body() dto: SubmitProductRequestDto, @Request() req) {
    return this.productRequestsService.submitRequest(dto, req.workspaceMember.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('review', 'ProductRequest'))
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

  @Get('my-requests')
  @CheckPolicies((ability) => ability.can('create', 'ProductRequest'))
  @ApiOperation({ summary: 'Listar mis solicitudes de creación (Member / Developer_Worker)' })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes del miembro autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getMyRequests(@Request() req) {
    return this.productRequestsService.getMyRequests(req.workspaceMember.id);
  }

  @Get('my-requests/:id')
  @CheckPolicies((ability) => ability.can('create', 'ProductRequest'))
  @ApiOperation({ summary: 'Obtener detalle enriquecido de una solicitud propia (Member)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud con datos enriquecidos' })
  @ApiResponse({ status: 403, description: 'No autorizado o no es el propietario' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  getMyRequestById(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.productRequestsService.getRequestById(
      id,
      req.workspaceMember.id,
      req.workspaceMember.tenantRole,
    );
  }

  @Get('pending-count')
  @CheckPolicies((ability) => ability.can('review', 'ProductRequest'))
  @ApiOperation({ summary: 'Cantidad de solicitudes en estado PENDING (para badge de revisores)' })
  @ApiResponse({ status: 200, schema: { type: 'object', properties: { count: { type: 'number' } } } })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  getPendingCount() {
    return this.productRequestsService.getPendingCount();
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('review', 'ProductRequest'))
  @ApiOperation({ summary: 'Obtener detalle enriquecido de una solicitud (GC)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud con datos enriquecidos' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  getRequestById(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.productRequestsService.getRequestById(
      id,
      req.workspaceMember.id,
      req.workspaceMember.tenantRole,
    );
  }

  @Patch(':id/review')
  @CheckPolicies((ability) => ability.can('review', 'ProductRequest'))
  @ApiOperation({ summary: 'Aprobar o rechazar una solicitud de creación (GC o PC)' })
  @ApiParam({ name: 'id', type: String, description: 'UUID de la solicitud' })
  @ApiResponse({ status: 200, description: 'Solicitud procesada' })
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
