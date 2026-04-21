import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOutputDto {
  @ApiPropertyOptional({ description: 'Nombre del output estratégico' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción del output' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Orden de visualización (entero >= 1)', minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  order?: number;
}
