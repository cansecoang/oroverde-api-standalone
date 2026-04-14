import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantRole } from '../../../../common/enums/business-roles.enum';

export class UpdateMemberDto {
  @ApiPropertyOptional({ description: 'Nuevo rol en el workspace', enum: TenantRole, example: 'general_coordinator' })
  @Transform(({ value }) => {
    const match = Object.entries(TenantRole).find(
      ([key, val]) => key === value || val === value,
    );
    return match ? match[1] : value;
  })
  @IsEnum(TenantRole, { message: 'El rol proporcionado no es válido' })
  @IsOptional()
  role?: TenantRole;

}
