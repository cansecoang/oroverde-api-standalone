import { SetMetadata } from '@nestjs/common';
import { Permission } from '../enums/business-roles.enum';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);