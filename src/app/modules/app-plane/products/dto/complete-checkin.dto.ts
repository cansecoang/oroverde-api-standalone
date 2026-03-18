import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CompleteCheckInDto {
  @ApiPropertyOptional({ description: 'Notas/minuta de la reunión', example: 'Se acordó extender la fase 2...' })
  @IsString()
  @IsOptional()
  notes?: string;
}
