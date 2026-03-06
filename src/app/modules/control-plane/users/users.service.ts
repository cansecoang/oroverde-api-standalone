import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalUser } from './entities/user.entity';
import { MailerService } from '@nestjs-modules/mailer'; // 👈 1. IMPORTAR
import * as bcrypt from 'bcrypt'; // 👈 2. IMPORTAR PARA HASH REAL
import * as crypto from 'crypto'; // 👈 3. IMPORTAR PARA GENERAR PASS

@Injectable()
export class GlobalUsersService {
  private readonly logger = new Logger(GlobalUsersService.name);

  constructor(
    @InjectRepository(GlobalUser, 'default')
    private repo: Repository<GlobalUser>,
    private readonly mailerService: MailerService // 👈 4. INYECTAR SERVICIO
  ) {}

  // Ruta ÚNICA de creación de usuarios (H-2: consolidado desde AuthService + GlobalUsersService)
  async create(email: string, firstName: string, lastName: string, orgId: string) {
    
    // A. Validar duplicados
    const existing = await this.repo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('A user with this email already exists');

    // B. Generar secretos (H-2: contraseña de 12 chars alfanuméricos)
    const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 12);
    const activationToken = crypto.randomBytes(32).toString('hex');
    
    // H-3: Token expira en 48 horas
    const activationTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    
    // C. Hashear la contraseña temporal para guardarla
    const salt = await bcrypt.genSalt();
    const hash = await bcrypt.hash(tempPassword, salt);

    try {
      // D. Guardar en BD
      const newUser = this.repo.create({
        email,
        firstName,
        lastName,
        organizationId: orgId,
        password_hash: hash,
        isActive: false,
        mustChangePassword: true,
        activationToken,
        activationTokenExpiry,
      });
      
      const savedUser = await this.repo.save(newUser);

      // E. ENVIAR EL CORREO (UX-3: use APP_NAME, fix URL to /activate, English) 📨
      const appName = process.env.APP_NAME || 'Oro Verde';
      const activationLink = `${process.env.APP_URL || 'http://localhost:4200'}/activate?token=${activationToken}`;
      
      await this.mailerService.sendMail({
        to: savedUser.email,
        subject: `Welcome to ${appName} — Your Access Credentials`,
        html: `
          <div style="font-family: 'Satoshi', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 16px;">
            <h1 style="color: #0b1623; font-size: 22px; margin: 0 0 8px;">Hello ${firstName},</h1>
            <p style="color: #64748b; font-size: 15px; line-height: 24px; margin: 0 0 24px;">You have been registered on the <strong>${appName}</strong> platform. Use the credentials below to log in.</p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #64748b;"><strong>Email:</strong> <span style="color: #0b1623;">${email}</span></p>
              <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Temporary Password:</strong> <span style="color: #0b1623; font-family: monospace;">${tempPassword}</span></p>
            </div>
            <p style="color: #64748b; font-size: 15px; line-height: 24px; margin: 0 0 20px;">Click the button below to activate your account. This link expires in <strong>48 hours</strong>.</p>
            <a href="${activationLink}" style="display: inline-block; padding: 14px 32px; background: #0b1623; color: #ffffff; text-decoration: none; border-radius: 9999px; font-size: 15px; font-weight: 600;">Activate Account</a>
            <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">If you did not expect this email, please disregard it.</p>
          </div>
        `,
      });

      return { 
        message: 'User created and email sent successfully',
        userId: savedUser.id 
      };

    } catch (error) {
      this.logger.error('Error creating user or sending email', error.stack);
      throw new InternalServerErrorException('Error creating user or sending email');
    }
  }

  async findAll(page = 1, limit = 50) {
    const [data, total] = await this.repo.findAndCount({
      relations: ['organization'],
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findByEmail(email: string): Promise<GlobalUser | null> {
    return this.repo.createQueryBuilder('user')
      // 🔓 Aquí está la magia:
      // "user" es el alias de la tabla
      // "password_hash" es la columna oculta que queremos revelar
      .addSelect('user.password_hash') 
      
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string) {
     return this.repo.findOne({ where: { id } }); }
}