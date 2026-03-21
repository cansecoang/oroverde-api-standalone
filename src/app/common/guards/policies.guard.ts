import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Scope,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AbilityFactory } from '../casl/ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../decorators/check-policies.decorator';

// REQUEST-scoped: depende de AbilityFactory que es REQUEST-scoped.
@Injectable({ scope: Scope.REQUEST })
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policies = this.reflector.getAllAndOverride<PolicyHandler[]>(CHECK_POLICIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @CheckPolicies → pasa (membresía ya verificada por TenantAccessGuard)
    if (!policies || policies.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user, workspaceMember } = request;

    if (!user || !workspaceMember) {
      throw new ForbiddenException('Usuario o membresía no identificados');
    }

    // Una sola construcción del Ability por request — todas las membresías en una query
    const ability = await this.abilityFactory.createForRequest(user, workspaceMember);

    // Inyectar en el request para que los controllers puedan usarlo (ej: getCapabilities)
    request.ability = ability;

    // AND lógico: todas las policies deben cumplirse
    const allowed = policies.every((handler) => handler(ability, request));

    if (!allowed) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }

    return true;
  }
}
