import { IsNotEmpty, IsUUID, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantRole } from '../../../../common/enums/business-roles.enum';

export class AddTenantMemberDto {
  @ApiProperty({ description: 'UUID del usuario global a vincular', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Rol dentro del tenant',
    enum: TenantRole,
    default: TenantRole.MEMBER,
  })
  @IsEnum(TenantRole)
  @IsOptional()
  tenantRole?: TenantRole;
}
