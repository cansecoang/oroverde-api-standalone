import { IsUUID, IsNumber, IsString, IsOptional, IsDateString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportProgressDto {
  @ApiProperty({ description: 'UUID de la asignación producto-estrategia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  productStrategyId: string;

  @ApiProperty({ description: 'Valor de avance reportado', example: 25 })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'Fecha del reporte (ISO 8601)', example: '2025-07-15' })
  @IsDateString({}, { message: 'La fecha debe estar en formato ISO (YYYY-MM-DD)' })
  date: string;

  @ApiPropertyOptional({ description: 'Notas adicionales', example: 'Avance verificado en campo' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'URL de evidencia', example: 'https://drive.google.com/file/abc' })
  @IsUrl({}, { message: 'La evidencia debe ser una URL válida' })
  @IsOptional()
  evidence_url?: string;
}