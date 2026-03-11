import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFieldDefinitionDto {
  @ApiPropertyOptional({ description: 'Etiqueta visible', example: 'Fecha de inicio', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ description: 'Tipo de campo (TEXT, NUMBER, DATE, CATALOG_REF, BOOLEAN)', example: 'DATE' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Código del catálogo vinculado (legacy, se resuelve a linkedCatalogId)', example: 'project_phases' })
  @IsString()
  @IsOptional()
  linkedCatalogCode?: string;

  @ApiPropertyOptional({ description: 'UUID del catálogo vinculado (preferido sobre linkedCatalogCode)' })
  @IsUUID('4')
  @IsOptional()
  linkedCatalogId?: string;

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
