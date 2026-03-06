import { IsString, IsNotEmpty, IsUUID, IsDateString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCheckInDto {
  @ApiProperty({ description: 'Título del check-in', example: 'Revisión semanal sprint 5' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Tema principal a tratar', example: 'Avance de indicadores' })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({ description: 'Fecha/hora programada (ISO 8601)', example: '2025-07-15T10:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduled_at: string;

  @ApiProperty({ description: 'UUID del producto asociado', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'UUID del organizador (ProductMember)', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID('4')
  @IsNotEmpty()
  organizerId: string;

  @ApiPropertyOptional({ description: 'Enlace a la reunión', example: 'https://meet.google.com/abc-defg-hij' })
  @IsString()
  @IsOptional()
  meeting_link?: string;

  @ApiPropertyOptional({ description: 'UUIDs de miembros invitados', type: [String], example: ['550e8400-e29b-41d4-a716-446655440002'] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attendeeIds?: string[];

  @ApiPropertyOptional({ description: 'UUIDs de tareas vinculadas', type: [String], example: ['550e8400-e29b-41d4-a716-446655440003'] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  linkedTaskIds?: string[];
}