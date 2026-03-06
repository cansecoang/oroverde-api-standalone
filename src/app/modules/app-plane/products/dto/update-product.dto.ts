import { IsString, IsOptional, IsUUID, IsObject, IsDateString, IsArray, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomOrgFieldDto, CustomCatalogFieldDto } from './custom-link-field.dto';

/**
 * UpdateProductDto
 * ─────────────────────────────────────────────────────────────────
 * Todos los campos son opcionales — solo se actualizan los enviados.
 * Los campos estándar se fusionan via `Object.assign`.
 * Los `attributes` se fusionan (merge) con los existentes.
 * ─────────────────────────────────────────────────────────────────
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Nombre del proyecto/producto' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Objetivo del proyecto' })
  @IsString()
  @IsOptional()
  objective?: string;

  @ApiPropertyOptional({ description: 'Descripción del proyecto' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Metodología del proyecto' })
  @IsString()
  @IsOptional()
  methodology?: string;

  @ApiPropertyOptional({ description: 'Entregable principal' })
  @IsString()
  @IsOptional()
  deliverable?: string;

  @ApiPropertyOptional({ description: 'Fecha de entrega (ISO 8601)', example: '2025-12-31' })
  @IsDateString({}, { message: 'La fecha de entrega debe ser una fecha válida (ISO 8601)' })
  @IsOptional()
  delivery_date?: string;

  @ApiPropertyOptional({ description: 'UUID de la organización dueña/líder' })
  @IsUUID('4', { message: 'El ID de la organización debe ser un UUID válido' })
  @IsOptional()
  ownerOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Código ISO 3166-1 alpha-2 del país', example: 'MX' })
  @IsString({ message: 'El código del país debe ser texto' })
  @Length(2, 2, { message: 'El código del país debe ser exactamente 2 caracteres (ISO 3166-1 alpha-2)' })
  @IsOptional()
  countryId?: string;

  @ApiPropertyOptional({ description: 'UUIDs de organizaciones participantes (reemplaza la lista completa)' })
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada ID de organización participante debe ser un UUID válido' })
  @IsOptional()
  participatingOrganizationIds?: string[];

  @ApiPropertyOptional({ description: 'Atributos dinámicos del proyecto (se fusiona con los existentes)' })
  @IsObject()
  @IsOptional()
  attributes?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Campos custom de tipo ORG_MULTI (M:N con organizaciones). Reemplaza los existentes.',
    type: [CustomOrgFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomOrgFieldDto)
  @IsOptional()
  customOrgFields?: CustomOrgFieldDto[];

  @ApiPropertyOptional({
    description: 'Campos custom de tipo CATALOG_MULTI (M:N con catalog items). Reemplaza los existentes.',
    type: [CustomCatalogFieldDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomCatalogFieldDto)
  @IsOptional()
  customCatalogFields?: CustomCatalogFieldDto[];
}
