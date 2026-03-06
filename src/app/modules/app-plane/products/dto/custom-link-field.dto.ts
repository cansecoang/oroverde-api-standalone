import { IsUUID, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * CustomOrgFieldDto
 * ─────────────────────────────────────────────────────────────────
 * Representa un campo custom ORG_MULTI: un fieldId (la definición)
 * con un arreglo de UUIDs de organizaciones a vincular.
 * ─────────────────────────────────────────────────────────────────
 */
export class CustomOrgFieldDto {
  @ApiProperty({ description: 'UUID del ProductFieldDefinition (tipo ORG_MULTI)' })
  @IsUUID('4', { message: 'fieldId debe ser un UUID válido' })
  fieldId: string;

  @ApiProperty({ description: 'UUIDs de las organizaciones a vincular', type: [String] })
  @IsArray({ message: 'orgIds debe ser un arreglo' })
  @IsUUID('4', { each: true, message: 'Cada orgId debe ser un UUID válido' })
  orgIds: string[];
}

/**
 * CustomCatalogFieldDto
 * ─────────────────────────────────────────────────────────────────
 * Representa un campo custom CATALOG_MULTI: un fieldId (la definición)
 * con un arreglo de UUIDs de catalog_items a vincular.
 * ─────────────────────────────────────────────────────────────────
 */
export class CustomCatalogFieldDto {
  @ApiProperty({ description: 'UUID del ProductFieldDefinition (tipo CATALOG_MULTI)' })
  @IsUUID('4', { message: 'fieldId debe ser un UUID válido' })
  fieldId: string;

  @ApiProperty({ description: 'UUIDs de los catalog items a vincular', type: [String] })
  @IsArray({ message: 'catalogItemIds debe ser un arreglo' })
  @IsUUID('4', { each: true, message: 'Cada catalogItemId debe ser un UUID válido' })
  catalogItemIds: string[];
}
