import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.isAuthenticated()) {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }

    // Verificar que la cuenta siga activa (previene acceso post-desactivación)
    const user = request.user;
    if (user && user.isActive === false) {
      request.logout(() => {});
      throw new ForbiddenException('Tu cuenta ha sido desactivada');
    }

    return true;
  }
}