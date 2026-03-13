import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskStatusDto {
  @ApiPropertyOptional({ description: 'UUID del producto (contexto para autorización)' })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiProperty({ description: 'UUID del nuevo estatus', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty({ message: 'Debes proporcionar un ID de estatus válido' })
  statusId: string;
}