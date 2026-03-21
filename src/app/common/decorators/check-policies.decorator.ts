import { SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { AppAbility } from '../casl/casl-types';

// Una PolicyHandler recibe el Ability del usuario y el request completo
// para acceder a params/body/query con el objeto específico.
export type PolicyHandler = (ability: AppAbility, request: Request) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
