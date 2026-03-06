import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para agregar un país al tenant.
 * Solo necesita el código ISO; nombre y timezone se copian de la lista global.
 */
export class AddTenantCountryDto {
  @ApiProperty({
    description: 'Código ISO 3166-1 alpha-2 del país a agregar',
    example: 'MX',
    minLength: 2,
    maxLength: 2,
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'El código ISO debe ser exactamente 2 caracteres' })
  code: string;
}
