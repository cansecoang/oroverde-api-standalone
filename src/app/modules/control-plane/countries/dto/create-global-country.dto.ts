import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGlobalCountryDto {
  @ApiProperty({ description: 'Código ISO 3166-1 alpha-2', example: 'MX', minLength: 2, maxLength: 2 })
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'El código ISO debe ser exactamente 2 caracteres' })
  code: string;

  @ApiProperty({ description: 'Nombre del país', example: 'México' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Zona horaria IANA', example: 'America/Mexico_City' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Código telefónico internacional', example: '+52' })
  @IsString()
  @IsOptional()
  phone_code?: string;

  @ApiPropertyOptional({ description: 'Región geográfica', example: 'Americas' })
  @IsString()
  @IsOptional()
  region?: string;
}
