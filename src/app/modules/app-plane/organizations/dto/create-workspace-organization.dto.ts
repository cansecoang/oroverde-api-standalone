import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceOrganizationDto {
  @ApiProperty({ description: 'Nombre de la organización', example: 'Cooperativa Verde' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiPropertyOptional({ description: 'Tipo de organización', example: 'ONG' })
  @IsString()
  @IsOptional()
  type?: string;
}