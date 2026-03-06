import { Injectable, Logger } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  private readonly logger = new Logger(SessionSerializer.name);

  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(user: any, done: Function) {
    // Solo almacenar el ID en la sesión — deserializeUser rehidrata desde DB
    done(null, { id: user.id });
  }

  async deserializeUser(payload: any, done: Function) {
    try {
      const user = await this.authService.findUserById(payload.id || payload);
      if (!user) {
        this.logger.warn(`Usuario no encontrado. ID: ${payload.id}`);
        return done(null, null);
      }
      done(null, user);
    } catch (error) {
      this.logger.error('Error deserializando usuario', error.stack);
      done(error);
    }
  }
}
