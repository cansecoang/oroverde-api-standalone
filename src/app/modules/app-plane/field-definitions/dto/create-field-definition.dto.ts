import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFieldDefinitionDto {
  @ApiProperty({ description: 'Clave única del campo', example: 'start_date', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'Etiqueta visible', example: 'Fecha de inicio', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ApiProperty({ description: 'Tipo de campo (TEXT, NUMBER, DATE, CATALOG_REF, BOOLEAN)', example: 'DATE' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ description: 'Código del catálogo vinculado (si type=CATALOG_REF)', example: 'project_phases' })
  @IsString()
  @IsOptional()
  linkedCatalogCode?: string;

  @ApiPropertyOptional({ description: '¿Campo obligatorio?', example: true })
  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Orden de visualización', example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}
