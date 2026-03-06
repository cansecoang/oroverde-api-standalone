import { IsString, IsOptional, IsUUID, Matches, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MatrixQueryDto {
  @ApiProperty({
    description: 'Campo por el que se agrupan las filas (eje Y)',
    example: 'owner_organization',
    enum: ['owner_organization', 'responsible_member', 'country'],
  })
  @IsString()
  @Matches(/^(owner_organization|responsible_member|country|attributes\..+)$/, {
    message:
      'groupBy debe ser owner_organization, responsible_member, country, o attributes.{key}',
  })
  groupBy = 'owner_organization';

  @ApiPropertyOptional({
    description: 'UUID del StrategicOutput para filtrar columnas',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'outputId debe ser un UUID válido' })
  @IsOptional()
  outputId?: string;

  @ApiPropertyOptional({
    description: 'UUID de la organización para filtrar filas',
  })
  @IsUUID('4', { message: 'organizationId debe ser un UUID válido' })
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Código ISO 3166-1 alpha-2 del país para filtrar filas',
    example: 'MX',
  })
  @IsString({ message: 'countryId debe ser un código ISO de 2 letras' })
  @Length(2, 2, { message: 'countryId debe ser exactamente 2 caracteres' })
  @IsOptional()
  countryId?: string;
}
