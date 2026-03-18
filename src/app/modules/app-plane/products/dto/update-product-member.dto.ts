import { IsEnum, IsBoolean, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductRole } from '../../../../common/enums/business-roles.enum';

export class UpdateProductMemberDto {
  @ApiPropertyOptional({ enum: ProductRole, description: 'Nuevo rol dentro del producto' })
  @IsEnum(ProductRole)
  @IsOptional()
  role?: ProductRole;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Porcentaje de dedicación (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  allocation?: number;

  @ApiPropertyOptional({ description: '¿Es el responsable principal del producto?' })
  @IsBoolean()
  @IsOptional()
  isResponsible?: boolean;
}
