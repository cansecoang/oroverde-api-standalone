import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceOrganizationDto {
  @ApiProperty({ description: 'Nombre de la organización', example: 'Cooperativa Verde' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiProperty({ description: 'Identificación fiscal', example: 'NIT-789012' })
  @IsString()
  @IsNotEmpty({ message: 'El Tax ID es obligatorio' })
  tax_id: string;

  @ApiPropertyOptional({ description: 'Tipo de organización', example: 'ONG' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Correo de contacto', example: 'info@cooperativa.org' })
  @IsEmail()
  @IsOptional()
  contact_email?: string;
}