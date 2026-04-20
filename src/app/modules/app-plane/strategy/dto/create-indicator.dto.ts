import { IsString, IsNotEmpty, IsNumber, IsInt, Min, IsUUID, IsOptional,IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIndicatorDto {
  @ApiProperty({ description: 'UUID del Output al que pertenece', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'Debes enviar un ID de Output válido' })
  @IsNotEmpty()
  outputId: string;

  @ApiProperty({ description: 'Número del indicador (entero >= 1)', example: 1 })
  @IsInt({ message: 'El número de indicador debe ser entero (ej: 1, 12)' })
  @Min(1)
  indicatorNumber: number;

  @ApiProperty({ description: 'Descripción del indicador', example: 'Número de personas capacitadas' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Unidad de medida', example: 'Personas' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'Meta total del indicador', example: 500, minimum: 0 })
  @IsNumber({}, { message: 'La meta total debe ser un número' })
  @Min(0)
  @IsOptional()
  total_target?: number;

  @ApiPropertyOptional({ description: 'Fecha de cumplimiento planificada (ISO)', example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  plannedCompletionDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de cumplimiento real (ISO)' })
  @IsDateString()
  @IsOptional()
  actualCompletionDate?: string;
}