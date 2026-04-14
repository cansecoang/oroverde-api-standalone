import { IsOptional, IsEnum, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceOrgType } from '../entities/workspace-organization.entity';

export class UpdateWorkspaceOrganizationDto {
  @ApiPropertyOptional({
    description: 'Tipo de organización (MAIN | PARTNER | null para limpiar)',
    enum: WorkspaceOrgType,
    nullable: true,
    example: WorkspaceOrgType.PARTNER,
  })
  @IsOptional()
  @ValidateIf((o) => o.type !== null)
  @IsEnum(WorkspaceOrgType)
  type?: WorkspaceOrgType | null;
}
