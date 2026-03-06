import { IsEmail, IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantRole } from '../../../../common/enums/business-roles.enum';

export class InviteMemberDto {
  @ApiProperty({ description: 'Correo electrónico del invitado', example: 'colaborador@org.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Rol en el workspace', enum: TenantRole, example: 'member' })
  @Transform(({ value }) => {
    const match = Object.entries(TenantRole).find(
      ([key, val]) => key === value || val === value
    );
    return match ? match[1] : value;
  })
  @IsEnum(TenantRole, { message: 'El rol proporcionado no es válido' })
  @IsNotEmpty()
  role: TenantRole;

  @ApiPropertyOptional({ description: 'Alias o cargo del miembro', example: 'Jefe de Campo' })
  @IsString()
  @IsOptional()
  alias?: string;
}