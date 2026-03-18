import { IsIn, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewProductRequestDto {
  @ApiProperty({ description: 'Acción del revisor', enum: ['approve', 'decline'] })
  @IsIn(['approve', 'decline'])
  action: 'approve' | 'decline';

  @ApiPropertyOptional({ description: 'Nota del revisor (máx 500 caracteres)', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
