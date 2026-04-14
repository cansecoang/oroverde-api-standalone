import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'carlos@oroverde.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre (firstName)', example: 'Carlos' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Apellido (lastName)', example: 'López' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'UUID de la organización global (organizationId)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'organizationId debe ser un UUID válido' })
  @IsOptional()
  organizationId?: string;
}
