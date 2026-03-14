import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStrategyTargetDto {
  @ApiProperty({
    description: 'Nueva meta comprometida para la asignación',
    example: 70,
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: 'La meta comprometida no puede ser negativa' })
  target: number;
}
