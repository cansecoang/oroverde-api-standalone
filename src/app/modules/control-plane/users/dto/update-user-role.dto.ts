import { IsEnum, IsNotEmpty } from 'class-validator';
import { GlobalRole } from '../../../../common/enums/global-roles.enum';

export class UpdateUserRoleDto {
  @IsEnum(GlobalRole)
  @IsNotEmpty()
  globalRole: GlobalRole;
}
