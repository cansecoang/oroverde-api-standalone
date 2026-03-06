import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatrixIndicatorDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() description: string;
  @ApiProperty() outputId: string;
  @ApiProperty() outputCode: string;
  @ApiProperty() outputName: string;
}

export class MatrixGroupDto {
  @ApiProperty({ description: 'UUID o valor JSONB del grupo' })
  id: string;

  @ApiProperty({ description: 'Nombre visible en el eje Y' })
  name: string;
}

export class MatrixProductDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() deliveryDate: string | null;
  @ApiPropertyOptional() ownerOrgName: string | null;
  @ApiPropertyOptional() deliverable: string | null;
  @ApiPropertyOptional({ description: 'committed_target del ProductStrategy para este indicador' })
  committedTarget: number | null;
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
