import { IsString, IsNotEmpty, IsOptional, IsUUID, IsDateString, IsArray, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomOrgFieldDto } from './custom-link-field.dto';
import { CustomFieldValueDto } from './custom-field-value.dto';

export class CreateProductDto {
  @ApiProperty({ description: 'Nombre del proyecto/producto', example: 'Proyecto reforestación 2025' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del proyecto es obligatorio' })
  name: string;

  @ApiPropertyOptional({ description: 'Objetivo del proyecto' })
  @IsString()
  @IsOptional()
  objective?: string;

  @ApiPropertyOptional({ description: 'Metodología del proyecto' })
  @IsString()
  @IsOptional()
  methodology?: string;

  @ApiPropertyOptional({ description: 'Entregable principal', example: 'Informe Técnico' })
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

  @ApiPropertyOptional({ description: 'UUIDs de organizaciones participantes' })
  @IsArray()
  @IsUUID('4', { each: true, message: 'Cada ID de organización participante debe ser un UUID válido' })
  @IsOptional()
  participatingOrganizationIds?: string[];

  @ApiPropertyOptional({
    description: 'Campos custom escalares (EAV Model).',
    type: [CustomFieldValueDto],
    example: [
      { fieldId: 'uuid-field-1', valueText: 'Some value' },
      { fieldId: 'uuid-field-2', valueCatalogId: 'uuid-catalog-item' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldValueDto)
  @IsOptional()
  customValues?: CustomFieldValueDto[];

  @ApiPropertyOptional({
    description: 'Campos custom de tipo ORG_MULTI (M:N con organizaciones)',
    type: [CustomOrgFieldDto],
    example: [{ fieldId: 'uuid-of-field-def', orgIds: ['uuid-org-1', 'uuid-org-2'] }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomOrgFieldDto)
  @IsOptional()
  customOrgFields?: CustomOrgFieldDto[];
}