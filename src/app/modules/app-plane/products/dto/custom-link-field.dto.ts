import { IsUUID, IsArray } from 'class-validator';
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
