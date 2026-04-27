import { IsString, IsNotEmpty, IsArray, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCatalogDto {
  @ApiProperty({ description: 'Nombre del catálogo', example: 'Fases del proyecto', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Código único (autogenerado a partir del nombre si no se envía)', example: 'FASES_DEL_PROYECTO', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Lista de items iniciales del catálogo', example: ['Planificación', 'Ejecución'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  items?: string[];
}
