import { Injectable, Scope, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';

// Entidades Globales
import { GlobalUser } from '../../control-plane/users/entities/user.entity';
import { TenantMember } from '../../control-plane/tenants/entities/tenant-member.entity';
import { Tenant } from '../../control-plane/tenants/entities/tenant.entity';

// Entidades Locales
import { WorkspaceMember } from './entities/workspace-member.entity';
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

// DTO
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable({ scope: Scope.REQUEST })
export class WorkspaceMembersService {
  private readonly logger = new Logger(WorkspaceMembersService.name);

  constructor(
    private readonly tenantConnection: TenantConnectionService,
    @InjectDataSource('default') private readonly globalDS: DataSource, // Conexión al Control Plane
    @Inject(REQUEST) private readonly request: any,
    private readonly notifications: NotificationsService,
  ) {}

  // 🚀 LÓGICA CORE: INVITAR
  async inviteMember(dto: InviteMemberDto, actorMemberId?: string) {
    // 1. Buscar al Usuario Global + Su Organización Maestra
    const globalUser = await this.globalDS.getRepository(GlobalUser).findOne({
      where: { email: dto.email },
      relations: ['organization'] // 👈 Vital: Traer la empresa para la que trabaja
    });

    if (!globalUser) {
      throw new NotFoundException('El usuario no está registrado en la plataforma global (GlobalUser).');
    }

    // 1.5 Verificar que la cuenta esté activa
    if (!globalUser.isActive) {
      throw new BadRequestException('La cuenta del usuario no está activa. Debe confirmar su correo antes de ser invitado.');
    }

    // 2. Conectar a la BD del Tenant
    const tenantDS = await this.tenantConnection.getTenantConnection();
    const memberRepo = tenantDS.getRepository(WorkspaceMember);
    const orgRepo = tenantDS.getRepository(WorkspaceOrganization);

    // 3. Verificar si ya es miembro (para no duplicar)
    const existingMember = await memberRepo.findOne({ where: { userId: globalUser.id } });
    if (existingMember) {
      throw new BadRequestException(`El usuario ${dto.email} ya es miembro de este espacio.`);
    }

    // 4. DETERMINAR LA ORGANIZACIÓN LOCAL (Target)
    let targetOrgId: string;

    if (globalUser.organization) {
      // CASO A: El usuario tiene empleo global (Ej: ONU)
      // Buscamos si la ONU ya existe en este tenant
      let localOrg = await orgRepo.findOne({ 
        where: { globalReferenceId: globalUser.organization.id } 
      });

      // Si no existe, la IMPORTAMOS automáticamente
      if (!localOrg) {
        this.logger.log(`Importando organización global "${globalUser.organization.name}" al tenant...`);
        localOrg = orgRepo.create({
          name: globalUser.organization.name,
          tax_id: globalUser.organization.tax_id,
          globalReferenceId: globalUser.organization.id,
          is_tenant_owner: false,
          type: 'PARTNER' // Asumimos que es un socio
        });
        await orgRepo.save(localOrg);
      }
      targetOrgId = localOrg.id;

    } else {
      // CASO B: El usuario es Freelance (No tiene org global)
      // Lo asignamos a la organización dueña del Tenant por defecto
      const ownerOrg = await orgRepo.findOne({ where: { is_tenant_owner: true } });
      if (!ownerOrg) {
        throw new Error('Inconsistencia crítica: El tenant no tiene una organización propietaria definida.');
      }
      targetOrgId = ownerOrg.id;
    }

    // 5. Crear el Miembro Local
    const newMember = memberRepo.create({
      userId: globalUser.id,
      email: globalUser.email,         // Copia local
      full_name: globalUser.fullName,  // Copia local (asegúrate de tener el getter fullName en GlobalUser)
      organizationId: targetOrgId,     // 👈 Vinculación automática
      tenantRole: dto.role,
      alias: dto.alias
    });

    const saved = await memberRepo.save(newMember);

    // Best-effort: notify the invited member
    void this.notifications.createNotification(
      tenantDS,
      saved.id,
      'WORKSPACE_MEMBER_INVITED',
      'Fuiste invitado a un workspace',
      `Fuiste invitado al workspace como ${dto.role}.`,
      { metadata: { role: dto.role } },
    );

    // 6. Registrar en tenant_members (Control Plane) para que getMyWorkspaces() lo encuentre
    const tenantSlug = this.request.tenantId; // Header: x-tenant-id
    const tenant = await this.globalDS.getRepository(Tenant).findOne({ where: { slug: tenantSlug } });

    if (tenant) {
      const tmRepo = this.globalDS.getRepository(TenantMember);
      const alreadyLinked = await tmRepo.findOne({
        where: { userId: globalUser.id, tenantId: tenant.id },
      });

      if (!alreadyLinked) {
        await tmRepo.save(tmRepo.create({
          userId: globalUser.id,
          tenantId: tenant.id,
        }));
        this.logger.log(`✅ tenant_members: ${globalUser.email} ↔ ${tenant.slug}`);
      }
    } else {
      this.logger.warn(`⚠️ No se encontró el tenant "${tenantSlug}" en Control Plane para registrar en tenant_members`);
    }

    // Audit: record workspace member invitation
    try {
      const auditRepo = tenantDS.getRepository(AuditLog);
      await auditRepo.save(auditRepo.create({
        actorMemberId: actorMemberId ?? null,
        entity: 'workspace_member',
        entityId: saved.id,
        action: 'CREATE',
        changes: {
          email: saved.email,
          tenantRole: saved.tenantRole,
          organizationId: saved.organizationId,
        },
      }));
    } catch (err) {
      this.logger.error(`AuditLog write failed for inviteMember: ${err?.message}`);
    }

    return saved;
  }

  // Sentinel UUID must match SUPER_ADMIN_SENTINEL_ID in tenant-access.guard.ts
  private static readonly SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

  // ✏️ ACTUALIZAR ROL / ALIAS
  async updateMember(id: string, dto: UpdateMemberDto, actorMemberId?: string): Promise<WorkspaceMember> {
    const tenantDS = await this.tenantConnection.getTenantConnection();
    const repo = tenantDS.getRepository(WorkspaceMember);

    const member = await repo.findOne({ where: { id }, relations: ['organization'] });
    if (!member) {
      throw new NotFoundException(`No se encontró el miembro '${id}' en este workspace.`);
    }

    const oldRole = member.tenantRole;
    const oldAlias = member.alias;

    if (dto.role !== undefined) member.tenantRole = dto.role;
    if (dto.alias !== undefined) member.alias = dto.alias;

    const saved = await repo.save(member);

    try {
      await tenantDS.getRepository(AuditLog).save(
        tenantDS.getRepository(AuditLog).create({
          actorMemberId: actorMemberId ?? null,
          entity: 'workspace_member',
          entityId: saved.id,
          action: 'UPDATE',
          changes: {
            role:  { from: oldRole,  to: saved.tenantRole },
            alias: { from: oldAlias, to: saved.alias },
          },
        }),
      );
    } catch { /* best-effort */ }

    return saved;
  }

  // 🔍 PERFIL PROPIO
  async findMyProfile(userId: string) {
    // Si el guard inyectó un workspaceMember sintético (super_admin),
    // lo retornamos directo sin consultar la BD del tenant.
    const injected = (this.request as any).workspaceMember;
    if (
      injected &&
      injected.id === WorkspaceMembersService.SUPER_ADMIN_SENTINEL_ID &&
      injected.userId === userId
    ) {
      return injected;
    }
    const tenantDS = await this.tenantConnection.getTenantConnection();
    const member = await tenantDS.getRepository(WorkspaceMember).findOne({
      where: { userId },
      relations: ['organization'],
    });
    if (!member) {
      throw new NotFoundException('No eres miembro de este workspace.');
    }
    return member;
  }

  // �📋 LISTAR MIEMBROS
  async findAll(page = 1, limit = 50) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const [data, total] = await dataSource.getRepository(WorkspaceMember).findAndCount({
      relations: ['organization'],
      order: { full_name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}