import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { subject } from '@casl/ability';
import { ProductsService } from './products.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MatrixQueryDto } from './dto/matrix-query.dto';
import { MatrixResponseDto, GroupByOptionDto, CatalogFilterOptionDto, MatrixOutputOptionDto } from './dto/matrix-response.dto';
import { ProductMetricsDto } from './dto/product-metrics.dto';
import { ValidationResultDto } from './dto/validation-result.dto';

@ApiTags('Products')
@ApiCookieAuth()
@Controller('products')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, PoliciesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  @ApiOperation({ summary: 'Crear producto/proyecto' })
  @ApiResponse({ status: 201, description: 'Producto creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  create(@Body() dto: CreateProductDto, @Request() req) {
    return this.productsService.create(dto, req.workspaceMember.id);
  }

  @Post('validate')
  @CheckPolicies((ability) => ability.can('create', 'Product'))
  @ApiOperation({ summary: 'Validar datos de producto sin crearlo (dry-run)' })
  @ApiResponse({ status: 200, description: 'Resultado de la validación', type: ValidationResultDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No autorizado' })
  async validateProduct(@Body() dto: CreateProductDto): Promise<ValidationResultDto> {
    const result = await this.productsService.validate(dto);
    return {
      valid: result.valid,
      errors: result.errors,
      message: result.valid ? 'Validación exitosa' : 'Se encontraron errores de validación',
    };
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Listar productos' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Buscar por nombre o descripción' })
  @ApiQuery({ name: 'organizationId', required: false, type: String, description: 'Filtrar por organización líder' })
  @ApiQuery({ name: 'countryId', required: false, type: String, description: 'Filtrar por país' })
  @ApiQuery({ name: 'groupBy', required: false, type: String, description: 'Agrupar/ordenar listado' })
  @ApiQuery({ name: 'outputId', required: false, type: String, description: 'Filtrar por output estratégico (UUID)' })
  @ApiQuery({ name: 'catalogFilters', required: false, type: String, description: 'JSON con filtros de catálogo' })
  @ApiResponse({ status: 200, description: 'Lista de productos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
    @Query('countryId') countryId?: string,
    @Query('groupBy') groupBy?: string,
    @Query('outputId') outputId?: string,
    @Query('catalogFilters') catalogFilters?: string,
  ) {
    return this.productsService.findAll(
      +page,
      +limit,
      search,
      organizationId,
      countryId,
      groupBy,
      outputId,
      catalogFilters,
    );
  }

  // ── Matrix ────────────────────────────────────────────────────────────
  // Estas rutas deben declararse ANTES de :id para que NestJS no trate
  // "matrix" como un UUID param.

  @Get('matrix/group-by-options')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Opciones disponibles para el dropdown Group By' })
  @ApiResponse({ status: 200, description: 'Lista de opciones', type: [GroupByOptionDto] })
  getGroupByOptions() {
    return this.productsService.getGroupByOptions();
  }

  @Get('matrix/catalog-filters')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Opciones de filtro por catálogo para la matrix' })
  @ApiResponse({ status: 200, description: 'Filtros de catálogo disponibles', type: [CatalogFilterOptionDto] })
  getCatalogFilters() {
    return this.productsService.getCatalogFilterOptions();
  }

  @Get('matrix/output-options')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Outputs estratégicos disponibles para filtrar la matrix' })
  @ApiResponse({ status: 200, description: 'Lista de outputs', type: [MatrixOutputOptionDto] })
  getMatrixOutputOptions() {
    return this.productsService.getMatrixOutputOptions();
  }

  @Get('matrix')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Product Matrix — vista bidimensional [Grupo × Indicadores]' })
  @ApiResponse({ status: 200, description: 'Datos de la matrix', type: MatrixResponseDto })
  @ApiResponse({ status: 400, description: 'groupBy inválido' })
  getMatrix(@Query() dto: MatrixQueryDto) {
    return this.productsService.buildMatrix(dto);
  }

  // getCapabilities usa req.ability que PoliciesGuard inyecta en el request.
  // El servicio lo recibe en lugar de recalcular la lógica de roles.
  @Get('capabilities')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Capacidades del usuario actual sobre Productos' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        canCreateProduct: { type: 'boolean' },
        canRequestProduct: { type: 'boolean' },
        pendingRequestsCount: { type: 'number' },
      },
    },
  })
  getCapabilities(@Request() req) {
    return this.productsService.getCapabilities(req.ability);
  }

  @Get('my')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Productos en los que participa el usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Lista de productos con el rol del usuario' })
  getMyProducts(@Request() req) {
    return this.productsService.getMyProducts(req.workspaceMember.id);
  }

  @Get(':id/metrics')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Obtener metricas consolidadas del producto' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Metricas del producto', type: ProductMetricsDto })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  getProductMetrics(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.getProductMetrics(id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Product'))
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Producto encontrado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  // Fix B-2: subject('Product', { id }) vincula el permiso al objeto concreto.
  // PRODUCT_COORDINATOR solo puede editar/eliminar SU producto — no cualquier producto.
  @Patch(':id')
  @CheckPolicies((ability, req) =>
    ability.can('update', subject('Product', { id: req.params.id }))
  )
  @ApiOperation({ summary: 'Actualizar producto' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Producto actualizado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Request() req,
  ) {
    return this.productsService.update(id, dto, req.workspaceMember.id);
  }

  @Delete(':id')
  @CheckPolicies((ability, req) =>
    ability.can('delete', subject('Product', { id: req.params.id }))
  )
  @ApiOperation({ summary: 'Eliminar producto' })
  @ApiParam({ name: 'id', type: String, description: 'UUID del producto' })
  @ApiResponse({ status: 200, description: 'Producto eliminado' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.productsService.remove(id, req.workspaceMember.id);
  }
}
