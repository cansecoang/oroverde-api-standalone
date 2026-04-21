import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateAccountDto {
  @ApiProperty({ description: 'Token de activación recibido por email', example: 'abc123...' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
