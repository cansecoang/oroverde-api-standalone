import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'Estado activo del usuario (true = activo, false = desactivado)',
    example: false,
  })
  @IsBoolean()
  isActive: boolean;
}
