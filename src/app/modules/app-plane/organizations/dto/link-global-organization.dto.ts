import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkGlobalOrganizationDto {
  @ApiProperty({ description: 'UUID de la organización global a vincular', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'El ID global debe ser un UUID válido' })
  @IsNotEmpty()
  globalId: string;
}