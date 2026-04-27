import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
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
}