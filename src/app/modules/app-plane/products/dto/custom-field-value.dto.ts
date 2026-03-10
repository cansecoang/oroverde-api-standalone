import {
  IsUUID,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'ExactlyOneCustomValue', async: false })
class ExactlyOneCustomValueConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CustomFieldValueDto;
    const hasText = typeof dto.valueText === 'string' && dto.valueText.trim().length > 0;
    const hasCatalogId = typeof dto.valueCatalogId === 'string' && dto.valueCatalogId.trim().length > 0;
    return (hasText || hasCatalogId) && !(hasText && hasCatalogId);
  }

  defaultMessage(): string {
    return 'Debe enviar exactamente uno: valueText o valueCatalogId.';
  }
}

/**
 * CustomFieldValueDto
 * ─────────────────────────────────────────────────────────────────
 * Representa un valor escalar para un campo custom (EAV Model).
 *
 * Solo uno de los campos de valor debe estar presente por registro:
 *   - valueText       → textos, números como string, fechas, booleans
 *   - valueCatalogId  → referencia FK a catalog_items
 * ─────────────────────────────────────────────────────────────────
 */
export class CustomFieldValueDto {
  @ApiProperty({ description: 'UUID del ProductFieldDefinition' })
  @IsUUID('4', { message: 'fieldId debe ser un UUID válido' })
  @Validate(ExactlyOneCustomValueConstraint)
  fieldId: string;

  @ApiPropertyOptional({ description: 'Valor de texto libre (TEXT, NUMBER, DATE, BOOLEAN como string)' })
  @IsString({ message: 'valueText debe ser texto' })
  @IsOptional()
  valueText?: string;

  @ApiPropertyOptional({ description: 'UUID de catalog_item referenciado (CATALOG_REF)' })
  @IsUUID('4', { message: 'valueCatalogId debe ser un UUID válido' })
  @IsOptional()
  valueCatalogId?: string;
}
