import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
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
}
