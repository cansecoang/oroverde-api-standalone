import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'carlos@oroverde.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre', example: 'Carlos' })
  @IsString()
  @IsOptional()
  first_name?: string;

  @ApiPropertyOptional({ description: 'Apellido', example: 'López' })
  @IsString()
  @IsOptional()
  last_name?: string;

  @ApiPropertyOptional({
    description: 'UUID de la organización global',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'organization_id debe ser un UUID válido' })
  @IsOptional()
  organization_id?: string;
}
