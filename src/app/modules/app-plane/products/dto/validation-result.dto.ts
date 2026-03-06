import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidationErrorDto {
  @ApiProperty({ description: 'Campo que falló la validación' })
  field: string;

  @ApiProperty({ description: 'Mensaje de error' })
  message: string;

  @ApiPropertyOptional({ description: 'Valor proporcionado' })
  value?: any;
}

export class ValidationResultDto {
  @ApiProperty({ description: 'Indica si la validación fue exitosa' })
  valid: boolean;

  @ApiPropertyOptional({ 
    description: 'Lista de errores encontrados', 
    type: [ValidationErrorDto] 
  })
  errors?: ValidationErrorDto[];

  @ApiPropertyOptional({ description: 'Mensaje general' })
  message?: string;
}
