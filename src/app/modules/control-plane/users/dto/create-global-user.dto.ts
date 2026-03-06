import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGlobalUserDto {
  @ApiProperty({ description: 'Correo electrónico', example: 'admin@org.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Nombre', example: 'Carlos' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Apellido', example: 'López' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'UUID de la organización global', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  orgId: string;
}
