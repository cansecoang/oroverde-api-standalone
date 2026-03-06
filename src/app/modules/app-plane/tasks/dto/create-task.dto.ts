import { IsString, IsNotEmpty, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Título de la tarea', example: 'Diseñar plan de reforestación' })
  @IsString()
  @IsNotEmpty({ message: 'El título de la tarea es obligatorio' })
  title: string;

  @ApiPropertyOptional({ description: 'Descripción detallada', example: 'Incluir cronograma y presupuesto' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'UUID del producto/proyecto', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'UUID de la organización responsable' })
  @IsUUID('4')
  @IsOptional()
  assignedOrganizationId?: string;

  @ApiPropertyOptional({ description: 'UUID de la fase (del catálogo)' })
  @IsUUID('4')
  @IsOptional()
  phaseId?: string;

  @ApiPropertyOptional({ description: 'UUID del estatus inicial' })
  @IsUUID('4')
  @IsOptional()
  statusId?: string;

  @ApiPropertyOptional({ description: 'UUID del miembro asignado (ProductMember)' })
  @IsUUID('4')
  @IsOptional()
  assigneeMemberId?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio planificada (ISO 8601)', example: '2025-08-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin planificada (ISO 8601)', example: '2025-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}