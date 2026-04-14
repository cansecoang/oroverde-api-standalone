import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGlobalOrganizationDto {
  @ApiProperty({ description: 'Nombre de la organización', example: 'ONG Desarrollo' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiPropertyOptional({ description: 'Código ISO 3166-1 alpha-2 del país', example: 'MX' })
  @IsString()
  @Length(2, 2, { message: 'El código de país debe ser de 2 caracteres' })
  @IsOptional()
  countryId?: string;
}