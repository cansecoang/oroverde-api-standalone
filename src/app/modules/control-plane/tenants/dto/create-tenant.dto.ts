import { IsNotEmpty, IsOptional, IsString, IsDateString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ description: 'Nombre del tenant/workspace', example: 'Empresa ABC', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Slug único (se auto-genera del nombre si no se envía)', example: 'empresa-abc', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Descripción del proyecto' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio (ISO date)', example: '2026-02-18' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin (ISO date)', example: '2028-07-12' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'URL del logo del proyecto' })
  @IsString()
  @IsOptional()
  logoUrl?: string;
}
