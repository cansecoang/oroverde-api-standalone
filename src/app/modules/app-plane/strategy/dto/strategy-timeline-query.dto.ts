import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class StrategyTimelineQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar timeline por UUID de output estratégico',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'outputId debe ser un UUID válido' })
  @IsOptional()
  outputId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar timeline por UUID de indicador estratégico',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'indicatorId debe ser un UUID válido' })
  @IsOptional()
  indicatorId?: string;

  @ApiPropertyOptional({
    description: 'Clave del campo custom que representa el workpackage',
    example: 'workpackage',
    default: 'workpackage',
  })
  @IsString()
  @Length(1, 64, { message: 'workpackageKey debe tener entre 1 y 64 caracteres' })
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, {
    message: 'workpackageKey tiene un formato inválido',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  workpackageKey?: string = 'workpackage';

  @ApiPropertyOptional({
    description: 'Texto para buscar por producto, indicador o workpackage',
    example: 'irrigation',
  })
  @IsString()
  @Length(1, 120, { message: 'search debe tener entre 1 y 120 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  search?: string;
}
