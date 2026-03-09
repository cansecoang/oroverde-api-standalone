import { IsUUID, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsBoolean, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductRole } from '../../../../common/enums/business-roles.enum';

export class AddProductMemberDto {
  @ApiProperty({ description: 'UUID del miembro del workspace', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'Debes seleccionar un miembro válido del espacio de trabajo' })
  @IsNotEmpty()
  memberId: string;

  @ApiPropertyOptional({ description: 'Rol en el producto', enum: ProductRole, default: ProductRole.VIEWER })
  @IsEnum(ProductRole)
  @IsOptional()
  role?: ProductRole = ProductRole.VIEWER;

  @ApiPropertyOptional({ description: 'Porcentaje de dedicación (0-100)', example: 50, minimum: 0, maximum: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0) @Max(100)
  allocation?: number;

  @ApiPropertyOptional({ description: '¿Es responsable del producto?', default: false })
  @IsBoolean()
  @IsOptional()
  isResponsible?: boolean;
}