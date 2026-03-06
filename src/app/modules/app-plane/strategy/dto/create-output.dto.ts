import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOutputDto {
  @ApiProperty({ description: 'Nombre del output estratégico', example: 'Comunidades fortalecidas' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Descripción del output' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Orden de visualización (entero >= 1)', example: 1, minimum: 1 })
  @IsInt({ message: 'El orden debe ser un número entero' })
  @Min(1, { message: 'El orden debe ser mayor a 0' })
  order: number;
}