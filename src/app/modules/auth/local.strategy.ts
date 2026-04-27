import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' }); // Nuestro login es por email
  }

  async validate(email: string, pass: string): Promise<any> {
    const { user, reason } = await this.authService.validateUser(email, pass);

    if (reason === 'not_found') {
      throw new UnauthorizedException('No encontramos una cuenta con ese correo electrónico.');
    }

    if (reason === 'wrong_password') {
      throw new UnauthorizedException('La contraseña es incorrecta.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Debes activar tu cuenta primero. Revisa tu correo.');
    }

    return user;
  }
}