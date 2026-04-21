import { IsString, IsOptional, Length } from 'class-validator';
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
    description: 'Código ISO 3166-1 alpha-2 del país',
    example: 'MX',
  })
  @IsString()
  @Length(2, 2, { message: 'El código de país debe ser de 2 caracteres' })
  @IsOptional()
  countryId?: string;
}
