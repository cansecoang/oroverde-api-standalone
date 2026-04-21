import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateIndicatorDto {
  @ApiPropertyOptional({ description: 'Descripción del indicador' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Unidad de medida', example: 'Personas' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ description: 'Meta total', minimum: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  total_target?: number;

  @ApiPropertyOptional({ description: 'Fecha de cumplimiento planificada (ISO)', example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  plannedCompletionDate?: string | null;

  @ApiPropertyOptional({ description: 'Fecha de cumplimiento real (ISO)' })
  @IsDateString()
  @IsOptional()
  actualCompletionDate?: string | null;
}
