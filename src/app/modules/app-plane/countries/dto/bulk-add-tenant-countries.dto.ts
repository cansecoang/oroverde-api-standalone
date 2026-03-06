import { IsArray, ArrayNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para agregar múltiples países al tenant de una sola vez.
 */
export class BulkAddTenantCountriesDto {
  @ApiProperty({
    description: 'Lista de códigos ISO 3166-1 alpha-2 a agregar',
    example: ['MX', 'CO', 'HN', 'GT'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe incluir al menos un código de país' })
  @IsString({ each: true })
  @Length(2, 2, { each: true, message: 'Cada código ISO debe ser exactamente 2 caracteres' })
  codes: string[];
}
