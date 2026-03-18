import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkspaceOrganizationDto {
  @ApiPropertyOptional({ description: 'Nombre de la organización', example: 'Cooperativa Verde' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Tipo de organización', example: 'ONG' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Correo de contacto', example: 'info@cooperativa.org' })
  @IsEmail()
  @IsOptional()
  contact_email?: string;
}
