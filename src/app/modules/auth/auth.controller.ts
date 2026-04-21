import { Controller, Post, UseGuards, Request, Get, Body, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { AuthService } from './auth.service';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // H-2: POST /auth/register ELIMINADO — ruta única: POST /admin/users
  // ─────────────────────────────────────────────────────────────────────────

  // DT-003: POST en lugar de GET para evitar exposición del token en logs/URLs
  @Post('activate')
  @ApiOperation({ summary: 'Activar cuenta', description: 'Activa la cuenta usando el token enviado por email (token en el body, no en la URL)' })
  @ApiResponse({ status: 201, description: 'Cuenta activada' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  async activate(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto.token);
  }

  // DT-004: Throttle estricto en login — 5 intentos por 15 minutos por IP
  @Throttle({ login: { limit: 5, ttl: 900000 } })
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión', description: 'Autentica con email/password y crea sesión con cookie' })
  @ApiBody({ schema: { type: 'object', properties: { email: { type: 'string', example: 'user@example.com' }, password: { type: 'string', example: 'SecurePass123' } }, required: ['email', 'password'] } })
  @ApiResponse({ status: 201, description: 'Login exitoso — cookie connect.sid establecida' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Request() req) {
    await new Promise<void>((resolve, reject) => {
      req.logIn(req.user, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    return { message: 'Login successful', user: req.user, mustChangePassword: req.user.mustChangePassword ?? false };
  }
  
  @UseGuards(AuthenticatedGuard)
  @Post('change-password')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cambiar contraseña', description: 'Permite al usuario cambiar su contraseña. Obligatorio en el primer inicio de sesión (contraseña temporal).' })
  @ApiResponse({ status: 201, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 400, description: 'Contraseña actual incorrecta o nueva contraseña inválida' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  // ── Forgot Password Flow (public, no auth required) ───────────────────

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset', description: 'Sends a 6-digit reset code to the user email' })
  @ApiResponse({ status: 201, description: 'Reset code sent (always returns success to prevent enumeration)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Verify reset code', description: 'Validates the 6-digit code and returns a one-time reset token' })
  @ApiResponse({ status: 201, description: 'Code verified, reset token returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(dto.email, dto.code);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password', description: 'Sets a new password using the reset token' })
  @ApiResponse({ status: 201, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }

  @UseGuards(AuthenticatedGuard)
  @Post('logout')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cerrar sesión', description: 'Destruye la sesión y limpia la cookie' })
  @ApiResponse({ status: 201, description: 'Sesión cerrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    res.clearCookie('connect.sid');
    return { message: 'Signed out' };
  }
  
  @UseGuards(AuthenticatedGuard)
  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Obtener perfil actual', description: 'Retorna los datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Datos del usuario' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getProfile(@Request() req) {
    return req.user;
  }

  /** Alias para compatibilidad con frontend checkSession() */
  @UseGuards(AuthenticatedGuard)
  @Get('session')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Verificar sesión activa', description: 'Alias de /auth/me — retorna el usuario si la sesión es válida' })
  @ApiResponse({ status: 200, description: 'Sesión activa' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getSession(@Request() req) {
    return req.user;
  }

  @UseGuards(AuthenticatedGuard)
  @Get('my-workspaces')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Obtener workspaces del usuario', description: 'Super Admin: todos los activos. Otros: solo workspaces donde es miembro.' })
  @ApiResponse({ status: 200, description: 'Lista de workspaces accesibles' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getMyWorkspaces(@Request() req) {
    return this.authService.getMyWorkspaces(req.user.id, req.user.globalRole);
  }
}