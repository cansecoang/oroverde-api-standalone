import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatrixIndicatorDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional() unit: string | null;
  @ApiPropertyOptional() totalTarget: number | null;
  @ApiProperty() outputId: string;
  @ApiProperty() outputCode: string;
  @ApiProperty() outputName: string;
}

export class MatrixGroupDto {
  @ApiProperty({ description: 'UUID o valor JSONB del grupo' })
  id: string;

  @ApiProperty({ description: 'Nombre visible en el eje Y' })
  name: string;

  @ApiProperty({ description: 'Cantidad de productos únicos en este grupo' })
  productCount: number;
}

export class MatrixProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() deliveryDate: string | null;
  @ApiPropertyOptional() ownerOrgName: string | null;
  @ApiPropertyOptional({ description: 'Nombre del pais del producto' })
  countryName: string | null;
  @ApiPropertyOptional() deliverable: string | null;
  @ApiPropertyOptional({ description: 'committed_target del ProductStrategy para este indicador' })
  committedTarget: number | null;
  @ApiPropertyOptional({ description: 'Unidad del indicador (e.g. hectáreas, personas)' })
  unit: string | null;
}

export class MatrixCellDto {
  @ApiProperty({ type: MatrixIndicatorDto })
  indicator: MatrixIndicatorDto;

  @ApiProperty({ type: MatrixGroupDto })
  group: MatrixGroupDto;

  @ApiProperty({ type: [MatrixProductDto] })
  products: MatrixProductDto[];
}

export class GroupByOptionDto {
  @ApiProperty({ description: 'Valor para el query param groupBy' })
  value: string;

  @ApiProperty({ description: 'Etiqueta visible en el dropdown' })
  label: string;

  @ApiProperty({ description: 'Si la opción está habilitada para este tenant' })
  available: boolean;

  @ApiPropertyOptional({ description: 'Tipo de campo: base o custom' })
  type?: 'base' | 'custom';
}

export class MatrixResponseDto {
  @ApiProperty({ type: GroupByOptionDto, description: 'Campo usado para agrupar' })
  groupByField: GroupByOptionDto;

  @ApiProperty({ type: [MatrixIndicatorDto], description: 'Indicadores con ≥1 producto' })
  indicators: MatrixIndicatorDto[];

  @ApiProperty({ description: 'Filas: [MatrixGroupDto, ...MatrixCellDto[]]' })
  matrix: Array<[MatrixGroupDto, ...MatrixCellDto[]]>;

  @ApiProperty({ description: 'Conteo total de productos únicos' })
  totalProducts: number;
}

export class CatalogFilterItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() code: string | null;
}

export class CatalogFilterOptionDto {
  @ApiProperty({ description: 'Clave del campo en attributes JSONB' })
  key: string;

  @ApiProperty({ description: 'Etiqueta visible' })
  label: string;

  @ApiProperty({ description: 'Código del catálogo vinculado' })
  catalogCode: string;

  @ApiProperty({ description: 'Tipo del campo', enum: ['CATALOG_REF'] })
  type: 'CATALOG_REF';

  @ApiProperty({ type: [CatalogFilterItemDto], description: 'Ítems disponibles para filtrar' })
  items: CatalogFilterItemDto[];
}

export class MatrixOutputOptionDto {
  @ApiProperty({ description: 'UUID del output estratégico' })
  id: string;

  @ApiProperty({ description: 'Código del output (ej: "1", "2")' })
  code: string;

  @ApiProperty({ description: 'Nombre del output' })
  name: string;
}
