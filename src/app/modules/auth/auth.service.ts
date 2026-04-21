import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailerService } from '@nestjs-modules/mailer';
import { GlobalUser } from '../control-plane/users/entities/user.entity';
import { GlobalUsersService } from '../control-plane/users/users.service';
import { TenantMember } from '../control-plane/tenants/entities/tenant-member.entity';
import { Tenant } from '../control-plane/tenants/entities/tenant.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';
import { SessionService } from '../../common/services/session.service';

@Injectable()
export class AuthService {
  constructor(
    // 1. Inyectamos el SERVICIO (Para buscar usuarios en validación)
    private usersService: GlobalUsersService,

    // 2. Inyectamos el REPOSITORIO de usuarios (Para crear/guardar en registro)
    @InjectRepository(GlobalUser)
    private usersRepository: Repository<GlobalUser>,

    // 3. Repositorios para workspaces del usuario
    @InjectRepository(TenantMember)
    private tenantMemberRepository: Repository<TenantMember>,

    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    // 4. Mailer for password reset emails
    private readonly mailerService: MailerService,

    // 5. DT-005: Session invalidation on password change
    private readonly sessionService: SessionService,

  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // NOTA (H-2): register() ELIMINADO — ruta única de creación: POST /admin/users
  // La lógica consolidada vive en GlobalUsersService.create()
  // ─────────────────────────────────────────────────────────────────────────

  // ACTIVACIÓN (H-3: ahora verifica expiración del token)
  async activateAccount(token: string) {
     const user = await this.usersRepository.findOne({
       where: { activationToken: token },
       select: ['id', 'isActive', 'activationToken', 'activationTokenExpiry', 'email', 'firstName', 'lastName', 'globalRole', 'organizationId', 'mustChangePassword', 'password_hash'],
     });

     if (!user) throw new BadRequestException('Invalid or already-used activation token.');

     // H-3: Verify token expiration
     if (user.activationTokenExpiry && new Date() > user.activationTokenExpiry) {
       throw new BadRequestException('This activation link has expired. Please contact your administrator for a new one.');
     }

     user.isActive = true;
     user.activationToken = null;
     user.activationTokenExpiry = null;
     await this.usersRepository.save(user);
     return { message: 'Account activated successfully.' };
  }

  // 3. VALIDACIÓN...
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.password_hash) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    const { password_hash, ...result } = user;
    return result;
  }

  // Cambio de contraseña (obligatorio en primer login)
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password_hash', 'mustChangePassword'],
    });
    if (!user) throw new BadRequestException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const salt = await bcrypt.genSalt();
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    await this.usersRepository.save(user);

    // DT-005: Invalidate all active sessions for this user after password change.
    // Best-effort — never fails the request if Redis is unavailable.
    await this.sessionService.purgeUserSessions(userId).catch(() => {});

    return { message: 'Password updated successfully' };
  }

  // ── Forgot Password Flow ──────────────────────────────────────────────

  /**
   * Step 1: Generate a 6-digit reset code, save it hashed, and email it.
   * Always returns success to avoid user enumeration.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({ where: { email } });

    if (user) {
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = await bcrypt.hash(code, 10);

      user.resetCode = hashedCode;
      user.resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      user.resetToken = null;
      user.resetTokenExpiry = null;
      await this.usersRepository.save(user);

      // Send email
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'OroVerde — Password Reset Code',
        html: `
          <div style="font-family: 'Satoshi', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
            <h1 style="font-size: 22px; font-weight: 700; color: #0b1623; margin: 0 0 8px;">Password Reset</h1>
            <p style="font-size: 15px; color: #64748b; margin: 0 0 24px;">Hi ${user.firstName}, use the code below to reset your password. It expires in 15 minutes.</p>
            <div style="background: #f8fafc; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0b1623;">${code}</span>
            </div>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        `,
      });
    }

    // Always return success to prevent user enumeration
    return { message: 'If that email is registered, a reset code has been sent.' };
  }

  /**
   * Step 2: Verify the 6-digit code and return a single-use reset token.
   */
  async verifyResetCode(email: string, code: string): Promise<{ resetToken: string }> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.resetCode')
      .where('user.email = :email', { email })
      .getOne();

    if (!user || !user.resetCode) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    if (user.resetCodeExpiry && new Date() > user.resetCodeExpiry) {
      throw new BadRequestException('Reset code has expired. Please request a new one.');
    }

    const isCodeValid = await bcrypt.compare(code, user.resetCode);
    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    // Code valid → generate a one-time reset token
    const resetToken = crypto.randomUUID();
    user.resetCode = null;
    user.resetCodeExpiry = null;
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await this.usersRepository.save(user);

    return { resetToken };
  }

  /**
   * Step 3: Use the reset token to set a new password.
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.resetToken')
      .where('user.resetToken = :resetToken', { resetToken })
      .getOne();

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    if (user.resetTokenExpiry && new Date() > user.resetTokenExpiry) {
      throw new BadRequestException('Reset token has expired. Please start the process again.');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }

    const salt = await bcrypt.genSalt();
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    user.mustChangePassword = false;
    await this.usersRepository.save(user);

    return { message: 'Password has been reset successfully.' };
  }

  // Nuevo método para buscar usuario por ID (usado en SessionSerializer)
  async findUserById(id: string): Promise<GlobalUser | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Retorna los workspaces accesibles para un usuario.
   * - Super Admin: todos los workspaces activos.
   * - Resto: solo los workspaces donde es miembro.
   */
  async getMyWorkspaces(userId: string, globalRole: string): Promise<WorkspaceDto[]> {
    let tenants: Tenant[];

    if (globalRole === 'super_admin') {
      tenants = await this.tenantRepository.find({
        where: { status: TenantStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
    } else {
      const memberships = await this.tenantMemberRepository.find({
        where: { userId },
        relations: ['tenant'],
      });
      tenants = memberships
        .map((m) => m.tenant)
        .filter((t) => t && t.status === TenantStatus.ACTIVE);
    }

    return tenants.map((t) => ({
      id:          t.id,
      name:        t.name,
      slug:        t.slug,
      status:      t.status,
      logoUrl:     t.logoUrl,
      location:    t.location,
      description: t.description,
      createdAt:   t.createdAt,
    }));
  }
}

export interface WorkspaceDto {
  id:          string;
  name:        string;
  slug:        string;
  status:      string;
  logoUrl:     string | null;
  location:    string | null;
  description: string | null;
  createdAt:   Date;
}