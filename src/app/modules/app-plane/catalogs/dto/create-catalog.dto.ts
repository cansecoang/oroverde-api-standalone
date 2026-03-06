import { IsString, IsNotEmpty, IsArray, ArrayMinSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatalogDto {
  @ApiProperty({ description: 'Nombre del catálogo', example: 'Fases del proyecto', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Código único del catálogo', example: 'project_phases', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'Lista de items del catálogo', example: ['Planificación', 'Ejecución', 'Cierre'], type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item' })
  @IsString({ each: true })
  items: string[];
}
