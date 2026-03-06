import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGlobalOrganizationDto {
  @ApiProperty({ description: 'Nombre de la organización', example: 'ONG Desarrollo' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiProperty({ description: 'Identificación fiscal (RFC/NIT)', example: 'NIT-123456' })
  @IsString()
  @IsNotEmpty({ message: 'El Tax ID (RFC/NIT) es obligatorio' })
  tax_id: string;

  @ApiPropertyOptional({ description: 'Descripción de la organización', example: 'Organización sin fines de lucro' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'UUID del país', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'El ID del país debe ser un UUID válido' })
  @IsOptional()
  countryId?: string;
}