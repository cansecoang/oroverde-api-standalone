import { IsUUID, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignStrategyDto {
  @ApiProperty({ description: 'UUID del producto/proyecto', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'UUID del indicador a asignar', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  indicatorId: string;

  @ApiProperty({ description: 'Meta comprometida para este proyecto', example: 100, minimum: 0 })
  @IsNumber()
  @Min(0, { message: 'La meta comprometida no puede ser negativa' })
  target: number;
}