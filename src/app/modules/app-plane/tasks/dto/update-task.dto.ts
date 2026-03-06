import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: 'Título de la tarea' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Descripción' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'UUID del nuevo estatus' })
  @IsUUID()
  @IsOptional()
  statusId?: string;

  @ApiPropertyOptional({ description: 'UUID de la nueva fase' })
  @IsUUID()
  @IsOptional()
  phaseId?: string;

  @ApiPropertyOptional({ description: 'UUID del miembro asignado' })
  @IsUUID()
  @IsOptional()
  assigneeMemberId?: string;

  @ApiPropertyOptional({ description: 'UUID de la organización asignada' })
  @IsUUID()
  @IsOptional()
  assignedOrganizationId?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio planificada', example: '2025-08-01' })
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin planificada', example: '2025-12-31' })
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio real' })
  @IsOptional()
  actualStartDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin real' })
  @IsOptional()
  actualEndDate?: string;
}
