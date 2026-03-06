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
    const user = await this.authService.validateUser(email, pass); // Asegúrate de que esto traiga password_hash y isActive
  
  if (!user) return null;

  // 👇 NUEVA VALIDACIÓN
  if (!user.isActive) {
    throw new UnauthorizedException('Debes activar tu cuenta primero. Revisa tu correo.');
  }
    return user;
  }
}