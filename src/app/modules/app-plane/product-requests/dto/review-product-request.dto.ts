import { IsIn, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewProductRequestDto {
  @ApiProperty({ description: 'Acción del revisor', enum: ['approve', 'decline', 'reject'] })
  @IsIn(['approve', 'decline', 'reject'])
  action: 'approve' | 'decline' | 'reject';

  @ApiPropertyOptional({ description: 'Nota del revisor (máx 500 caracteres)', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
