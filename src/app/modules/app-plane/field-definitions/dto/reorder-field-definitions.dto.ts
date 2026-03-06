import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderFieldDefinitionsDto {
  @ApiProperty({
    description: 'Array ordenado de IDs de campo. La posición en el array define el nuevo orden.',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedIds: string[];
}
