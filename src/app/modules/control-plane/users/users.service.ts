import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GlobalUser } from './entities/user.entity';
import { GlobalOrganization } from '../organizations/entities/global-organization.entity';
import { TenantMember } from '../tenants/entities/tenant-member.entity';
import { GlobalAuditLog } from '../audit/entities/global-audit-log.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { GlobalRole } from '../../../common/enums/global-roles.enum';
import { SessionService } from '../../../common/services/session.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailerService } from '@nestjs-modules/mailer';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class GlobalUsersService {
  private readonly logger = new Logger(GlobalUsersService.name);

  constructor(
    @InjectRepository(GlobalUser, 'default')
    private repo: Repository<GlobalUser>,
    @InjectRepository(GlobalOrganization, 'default')
    private readonly orgRepo: Repository<GlobalOrganization>,
    @InjectRepository(TenantMember, 'default')
    private readonly tenantMemberRepo: Repository<TenantMember>,
    @InjectDataSource('default')
    private readonly controlPlaneDs: DataSource,
    private readonly mailerService: MailerService,
    private readonly sessionService: SessionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async writeGlobalAudit(
    actorUserId: string | null,
    action: string,
    entityId: string,
    changes: Record<string, any>,
  ): Promise<void> {
    try {
      const repo = this.controlPlaneDs.getRepository(GlobalAuditLog);
      await repo.save(repo.create({ actorUserId, action, entity: 'USER', entityId, changes }));
    } catch (err) {
      this.logger.error(`GlobalAuditLog write failed: ${err?.message}`, err?.stack);
    }
  }

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

      await this.writeGlobalAudit(null, 'CREATE', savedUser.id, {
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        organizationId: orgId,
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
    return this.repo.findOne({ where: { id } });
  }

  // ─── MÓDULO 2: MUTACIONES ─────────────────────────────

  async update(id: string, changes: UpdateUserDto, actorUserId?: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Validar que no exista otro usuario con el mismo email
    if (changes.email !== undefined) {
      const nextEmail = changes.email.trim().toLowerCase();
      const existingByEmail = await this.repo
        .createQueryBuilder('u')
        .where('LOWER(u.email) = LOWER(:email)', { email: nextEmail })
        .andWhere('u.id <> :id', { id })
        .getOne();

      if (existingByEmail) {
        throw new BadRequestException('A user with this email already exists');
      }
    }

    // Validar que la organización destino exista
    if (changes.organization_id) {
      const org = await this.orgRepo.findOne({ where: { id: changes.organization_id } });
      if (!org) {
        throw new BadRequestException('La organización especificada no existe.');
      }
    }

    const mergeData: Record<string, any> = {};
  if (changes.email !== undefined) mergeData.email = changes.email.trim().toLowerCase();
    if (changes.first_name !== undefined) mergeData.firstName = changes.first_name;
    if (changes.last_name !== undefined) mergeData.lastName = changes.last_name;
    if (changes.organization_id !== undefined) mergeData.organizationId = changes.organization_id;

    this.repo.merge(user, mergeData);
    const saved = await this.repo.save(user);

    this.eventEmitter.emit('user.updated', {
      id: saved.id,
      email: saved.email,
      firstName: saved.firstName,
      lastName: saved.lastName,
    });
    this.logger.log(`Evento 'user.updated' emitido para ${saved.id}`);

    await this.writeGlobalAudit(actorUserId ?? null, 'UPDATE', id, { changes });

    return saved;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, actorUserId?: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    user.isActive = dto.isActive;
    await this.repo.save(user);

    let sessionsPurged = 0;
    if (!dto.isActive) {
      sessionsPurged = await this.sessionService.purgeUserSessions(id);
    }

    await this.writeGlobalAudit(actorUserId ?? null, 'UPDATE', id, {
      old: { isActive: !dto.isActive },
      new: { isActive: dto.isActive },
    });

    return {
      message: dto.isActive
        ? `Usuario '${user.email}' activado exitosamente.`
        : `Usuario '${user.email}' desactivado. ${sessionsPurged} sesión(es) purgada(s).`,
      isActive: dto.isActive,
      ...(dto.isActive ? {} : { sessionsPurged }),
    };
  }

  async remove(id: string, actorUserId?: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // 1. No permitir eliminar usuarios activos — fuerza desactivación primero
    if (user.isActive) {
      throw new ConflictException(
        'No se puede eliminar un usuario activo. Desactívelo primero (PATCH /status).',
      );
    }

    // 2. Verificar membresías en workspaces (tenant_members)
    const tenantCount = await this.tenantMemberRepo.count({ where: { userId: id } });
    if (tenantCount > 0) {
      throw new ConflictException(
        `No se puede eliminar el usuario porque pertenece a ${tenantCount} workspace(s). Retírelo de todos los workspaces primero.`,
      );
    }

    await this.repo.delete(id);

    await this.writeGlobalAudit(actorUserId ?? null, 'DELETE', id, {
      email: user.email,
    });

    return {
      message: `Usuario '${user.email}' eliminado exitosamente.`,
      deletedId: id,
    };
  }

  async updateRole(id: string, dto: UpdateUserRoleDto, requesterId: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (id === requesterId) {
      throw new BadRequestException('No puede cambiar su propio rol.');
    }

    // Proteger que siempre quede al menos 1 SUPER_ADMIN en el sistema
    if (user.globalRole === GlobalRole.SUPER_ADMIN && dto.globalRole !== GlobalRole.SUPER_ADMIN) {
      const adminCount = await this.repo.count({ where: { globalRole: GlobalRole.SUPER_ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'No se puede degradar al único Super Admin del sistema. Promueva otro usuario primero.',
        );
      }
    }

    const previousRole = user.globalRole;
    user.globalRole = dto.globalRole;
    const saved = await this.repo.save(user);

    // Purgar sesiones si se degrada de super_admin → user para forzar re-login
    let sessionsPurged = 0;
    if (previousRole === GlobalRole.SUPER_ADMIN && dto.globalRole !== GlobalRole.SUPER_ADMIN) {
      sessionsPurged = await this.sessionService.purgeUserSessions(id);
    }

    this.logger.log(`Rol de '${user.email}' cambiado: ${previousRole} → ${dto.globalRole}`);

    await this.writeGlobalAudit(requesterId, 'UPDATE', id, {
      old: { globalRole: previousRole },
      new: { globalRole: dto.globalRole },
    });

    return {
      message: `Rol de '${saved.email}' actualizado de '${previousRole}' a '${dto.globalRole}'.`,
      id: saved.id,
      email: saved.email,
      previousRole,
      currentRole: saved.globalRole,
      ...(sessionsPurged > 0 ? { sessionsPurged } : {}),
    };
  }
}