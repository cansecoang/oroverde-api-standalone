import { IsString, IsNotEmpty, IsArray, ArrayMinSize, MaxLength, IsOptional } from 'class-validator';
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

  @ApiProperty({ description: 'Lista de items del catálogo', example: ['Planificación', 'Ejecución', 'Cierre'], type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item' })
  @IsString({ each: true })
  items: string[];
}
