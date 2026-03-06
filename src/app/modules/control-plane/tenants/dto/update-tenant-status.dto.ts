import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '../../../../common/enums/tenant-status.enum';

export class UpdateTenantStatusDto {
  @ApiProperty({
    description: 'Nuevo estado del tenant',
    enum: TenantStatus,
    example: TenantStatus.SUSPENDED,
  })
  @IsEnum(TenantStatus)
  status: TenantStatus;
}
