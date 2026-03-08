import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para actualizar una organización global.
 * Todas las propiedades son opcionales (PATCH).
 */
export class UpdateGlobalOrganizationDto {
  @ApiPropertyOptional({
    description: 'Nombre de la organización',
    example: 'ONG Desarrollo Sostenible',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Identificación fiscal (RFC/NIT)',
    example: 'NIT-654321',
  })
  @IsString()
  @IsOptional()
  tax_id?: string;

  @ApiPropertyOptional({
    description: 'Descripción de la organización',
    example: 'Organización enfocada en proyectos sostenibles',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'UUID del país',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'El ID del país debe ser un UUID válido' })
  @IsOptional()
  country_id?: string;
}
