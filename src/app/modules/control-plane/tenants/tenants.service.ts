import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException, Logger, Inject, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantMember } from './entities/tenant-member.entity';
import { TenantStatus } from '../../../common/enums/tenant-status.enum';
import { GlobalUser } from '../users/entities/user.entity';
import { GlobalOrganization } from '../organizations/entities/global-organization.entity';
import { GlobalAuditLog } from '../audit/entities/global-audit-log.entity';

// Entidades directas aún necesarias en este servicio
import { WorkspaceMember }       from '../../app-plane/members/entities/workspace-member.entity';
import { WorkspaceOrganization, WorkspaceOrgType } from '../../app-plane/organizations/entities/workspace-organization.entity';
import { TenantRole }            from '../../../common/enums/business-roles.enum';

// Lista de entidades del app-plane (local en apps/api, sin circular dep con libs)
import { APP_PLANE_ENTITIES } from '../../app-plane/app-plane-entities';
// IoC: token de callback — consolidado en apps/api
import { TENANT_SEED_CALLBACK, TenantSeedCallback } from '../../../common/tokens/tenant-init.token';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private dataSource: DataSource,
    @Optional() @Inject(TENANT_SEED_CALLBACK)
    private readonly seedCallback: TenantSeedCallback | null,
  ) {}

  private async writeGlobalAudit(
    actorUserId: string | null,
    action: string,
    entity: string,
    entityId: string,
    changes: Record<string, any>,
  ): Promise<void> {
    try {
      const repo = this.dataSource.getRepository(GlobalAuditLog);
      await repo.save(repo.create({ actorUserId, action, entity, entityId, changes }));
    } catch (err) {
      this.logger.error(`GlobalAuditLog write failed: ${err?.message}`, err?.stack);
    }
  }

  /** Lista todos los tenants registrados */
  async findAll() {
    return this.dataSource.getRepository(Tenant).find({
      order: { createdAt: 'DESC' },
      select: ['id', 'name', 'slug', 'status', 'logoUrl', 'description', 'startDate', 'endDate', 'createdAt'],
    });
  }

  async createTenant(
    data: { name: string; slug?: string; description?: string; startDate?: string; endDate?: string; logoUrl?: string },
    superAdminId: string,
  ) {
    // Auto-generar slug si no se envía
    const slug = data.slug || data.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    // 0. Validar formato del slug (previene SQL injection en CREATE DATABASE)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slug || !slugRegex.test(slug) || slug.length > 50) {
      throw new BadRequestException('El slug solo puede contener letras minúsculas, números y guiones. Máximo 50 caracteres.');
    }

    // 1. Validar Slug Único en la BD Global
    const existing = await this.dataSource.getRepository(Tenant).findOne({ where: { slug } });
    if (existing) throw new BadRequestException('El slug ya está en uso');

    // Nombre de la BD física (Silo) — seguro porque el slug fue validado arriba
    const dbName = `tenant_${slug.replace(/-/g, '_').toLowerCase()}`;

    // ---------------------------------------------------------
    // 2. CREAR LA BASE DE DATOS FÍSICA 🏗️
    // ---------------------------------------------------------
    try {
      // 'CREATE DATABASE' no soporta transacciones, va directo.
      await this.dataSource.query(`CREATE DATABASE "${dbName}"`);
      this.logger.log(`✅ Base de datos ${dbName} creada.`);
    } catch (error) {
      throw new InternalServerErrorException(`Error creando la base de datos física: ${error.message}`);
    }

    // ---------------------------------------------------------
    // 3. REGISTRAR EL TENANT EN CONTROL PLANE
    // ---------------------------------------------------------
    let savedTenant: Tenant;
    try {
        const newTenant = new Tenant();
        newTenant.name = data.name;
        newTenant.slug = slug;
        newTenant.dbName = dbName;
        if (data.description) newTenant.description = data.description;
        if (data.startDate)   newTenant.startDate   = data.startDate;
        if (data.endDate)     newTenant.endDate     = data.endDate;
        if (data.logoUrl)     newTenant.logoUrl     = data.logoUrl;

        savedTenant = await this.dataSource.getRepository(Tenant).save(newTenant);
    } catch (error) {
        // Rollback Manual: Borramos la BD si falló el registro
        await this.dataSource.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        throw new InternalServerErrorException('Error guardando el registro del tenant');
    }

    // ---------------------------------------------------------
    // 4. INICIALIZAR TABLAS Y ASIGNAR DUEÑO
    // ---------------------------------------------------------
    
    // Conexión temporal a la nueva BD
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbSslEnabled = (process.env.DB_SSL || 'false') === 'true';

    const tenantDataSource = new DataSource({
      type: 'postgres',
      host: dbHost,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: dbName,
      entities: [...APP_PLANE_ENTITIES],
      synchronize: true, // Necesario para crear tablas en BD nueva
      // Azure PostgreSQL exige TLS; sin ssl aparece "no pg_hba.conf entry ... no encryption".
      ssl: dbSslEnabled || dbHost.includes('azure')
        ? { rejectUnauthorized: false }
        : false,
      connectTimeoutMS: 10000,
      extra: {
        connectionTimeoutMillis: 10000,
        query_timeout: 30000,
      },
    });

    try {
        await tenantDataSource.initialize();

        // 5. CONSULTAR DATOS DEL CREADOR DESDE EL CONTROL PLANE
        const superAdmin = await this.dataSource.getRepository(GlobalUser).findOne({ where: { id: superAdminId } });
        if (!superAdmin) throw new BadRequestException('No se encontró el usuario Super Admin en el sistema');

        const globalOrg = await this.dataSource.getRepository(GlobalOrganization).findOne({
          where: { id: superAdmin.organizationId },
          relations: ['country'],
        });
        if (!globalOrg) throw new BadRequestException('No se encontró la organización del Super Admin');

        // 6. REGISTRAR LA ORGANIZACIÓN GLOBAL COMO PARTICIPANTE EN EL BUSINESS-PLANE 🏢
        const orgRepo = tenantDataSource.getRepository(WorkspaceOrganization);
        const workspaceOrg = orgRepo.create({
            globalReferenceId: globalOrg.id,
            is_tenant_owner: true,
            name: globalOrg.name,
            type: WorkspaceOrgType.MAIN,
            countryId: globalOrg.country?.code ?? null,
        });
        const savedWorkspaceOrg = await orgRepo.save(workspaceOrg);
        this.logger.log(`🏢 Organización '${globalOrg.name}' registrada en ${dbName}`);

        // 7. AUTO-ASIGNACIÓN 🎩 (Tú eres el jefe, vinculado a tu organización)
        const membersRepo = tenantDataSource.getRepository(WorkspaceMember);
        
        const meAsBoss = membersRepo.create({
            userId: superAdminId,
            email: superAdmin.email,
            first_name: superAdmin.firstName,
            last_name: superAdmin.lastName,
            organizationId: savedWorkspaceOrg.id,
            tenantRole: TenantRole.GENERAL_COORDINATOR,
        });

        await membersRepo.save(meAsBoss);
        this.logger.log(`👑 Super Admin asignado como dueño en ${dbName}`);

        // 7b. REGISTRAR TenantMember en CONTROL PLANE
        // Vincular al creador con el tenant en la tabla global
        const tenantMemberRepo = this.dataSource.getRepository(TenantMember);
        await tenantMemberRepo.save(
          tenantMemberRepo.create({
            userId: superAdminId,
            tenantId: savedTenant.id,
          })
        );
        this.logger.log(`🔗 TenantMember creado en control_plane para ${superAdmin.email}`);

        // IoC: seed externo si fue provisto 🌱
        if (this.seedCallback) {
          await this.seedCallback(tenantDataSource);
          this.logger.log(`🌱 Seed completado en ${dbName}`);
        }

    } catch (error) {
        this.logger.error('Error inicializando el tenant:', error);
        throw new InternalServerErrorException('El tenant se creó pero falló la inicialización de tablas.');
    } finally {
        // Importante: Cerrar conexión temporal
        if (tenantDataSource.isInitialized) {
            await tenantDataSource.destroy();
        }
    }

    await this.writeGlobalAudit(superAdminId, 'CREATE', 'TENANT', savedTenant.id, {
      name: savedTenant.name,
      slug: savedTenant.slug,
      dbName: savedTenant.dbName,
    });

    return {
      msg: 'Tenant creado exitosamente. Ya eres el dueño.',
      tenant: savedTenant
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // H-1: AGREGAR USUARIO EXISTENTE A UN TENANT
  // ─────────────────────────────────────────────────────────────────────────

  async addMemberToTenant(
    tenantId: string,
    userId: string,
    tenantRole: TenantRole = TenantRole.MEMBER,
  ) {
    // 1. Verificar que el tenant exista y esté activo
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new BadRequestException(`No se puede agregar miembros a un tenant ${tenant.status}`);
    }

    // 2. Verificar que el usuario exista
    const user = await this.dataSource.getRepository(GlobalUser).findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // 3. Verificar que no sea miembro duplicado
    const existingMember = await this.dataSource.getRepository(TenantMember).findOne({
      where: { userId, tenantId },
    });
    if (existingMember) throw new BadRequestException('El usuario ya es miembro de este tenant');

    // 4. Buscar la organización global del usuario
    const globalOrg = await this.dataSource.getRepository(GlobalOrganization).findOne({
      where: { id: user.organizationId },
      relations: ['country'],
    });
    if (!globalOrg) throw new BadRequestException('No se encontró la organización del usuario');

    // 5. Conectar a la BD del tenant
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbSslEnabled = (process.env.DB_SSL || 'false') === 'true';

    const tenantDataSource = new DataSource({
      type: 'postgres',
      host: dbHost,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: tenant.dbName,
      entities: [...APP_PLANE_ENTITIES],
      synchronize: false,
      ssl: dbSslEnabled || dbHost.includes('azure')
        ? { rejectUnauthorized: false }
        : false,
      connectTimeoutMS: 10000,
      extra: {
        connectionTimeoutMillis: 10000,
        query_timeout: 30000,
      },
    });

    try {
      await tenantDataSource.initialize();

      // 6. Verificar/crear la organización en el workspace del tenant
      const orgRepo = tenantDataSource.getRepository(WorkspaceOrganization);
      let workspaceOrg = await orgRepo.findOne({
        where: { globalReferenceId: globalOrg.id },
      });

      if (!workspaceOrg) {
        workspaceOrg = await orgRepo.save(orgRepo.create({
          globalReferenceId: globalOrg.id,
          is_tenant_owner: false,
          name: globalOrg.name,
          type: WorkspaceOrgType.PARTNER,
          countryId: globalOrg.country?.code ?? null,
        }));
        this.logger.log(`🏢 Organización '${globalOrg.name}' vinculada a ${tenant.dbName}`);
      }

      // 7. Crear el WorkspaceMember en la BD del tenant
      const membersRepo = tenantDataSource.getRepository(WorkspaceMember);

      const existingWsMember = await membersRepo.findOne({ where: { userId } });
      if (existingWsMember) {
        throw new BadRequestException('El usuario ya existe como miembro del workspace');
      }

      await membersRepo.save(membersRepo.create({
        userId,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        organizationId: workspaceOrg.id,
        tenantRole,
      }));

      // 8. Crear el TenantMember en control plane
      const tmRepo = this.dataSource.getRepository(TenantMember);
      await tmRepo.save(tmRepo.create({ userId, tenantId }));

      this.logger.log(`✅ Usuario ${user.email} agregado al tenant ${tenant.slug} como ${tenantRole}`);

      return {
        message: `Usuario ${user.email} agregado como ${tenantRole} en el workspace ${tenant.name}`,
        tenantSlug: tenant.slug,
        role: tenantRole,
      };
    } finally {
      if (tenantDataSource.isInitialized) {
        await tenantDataSource.destroy();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // H-4: ACTUALIZAR ESTADO DEL TENANT
  // ─────────────────────────────────────────────────────────────────────────

  async updateStatus(tenantId: string, status: TenantStatus, actorUserId?: string) {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    if (tenant.status === status) {
      return { message: `El tenant ya se encuentra en estado ${status}`, tenant };
    }

    const previousStatus = tenant.status;
    tenant.status = status;
    const saved = await this.dataSource.getRepository(Tenant).save(tenant);
    this.logger.log(`🔄 Tenant '${tenant.slug}' → status: ${status}`);

    await this.writeGlobalAudit(actorUserId ?? null, 'UPDATE', 'TENANT', tenantId, {
      old: { status: previousStatus },
      new: { status },
    });

    return { message: `Tenant actualizado a ${status}`, tenant: saved };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // H-4: ELIMINAR TENANT (SOFT → ARCHIVED + opcional DROP DATABASE)
  // ─────────────────────────────────────────────────────────────────────────

  async deleteTenant(tenantId: string, dropDatabase = false, actorUserId?: string) {
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    // 1. Archivar el tenant
    tenant.status = TenantStatus.ARCHIVED;
    await this.dataSource.getRepository(Tenant).save(tenant);
    this.logger.log(`📦 Tenant '${tenant.slug}' archivado`);

    // 2. Eliminar TenantMembers asociados
    await this.dataSource.getRepository(TenantMember).delete({ tenantId });
    this.logger.log(`🗑️ TenantMembers eliminados para tenant ${tenant.slug}`);

    // 3. Opcionalmente eliminar la BD física
    if (dropDatabase) {
      try {
        await this.dataSource.query(`DROP DATABASE IF EXISTS "${tenant.dbName}"`);
        this.logger.warn(`💀 Base de datos ${tenant.dbName} ELIMINADA permanentemente`);
      } catch (error) {
        this.logger.error(`Error eliminando BD ${tenant.dbName}: ${error.message}`);
        throw new InternalServerErrorException('Tenant archivado pero no se pudo eliminar la base de datos');
      }
    }

    await this.writeGlobalAudit(actorUserId ?? null, 'DELETE', 'TENANT', tenantId, {
      name: tenant.name,
      slug: tenant.slug,
      dropDatabase,
    });

    return {
      message: dropDatabase
        ? `Tenant '${tenant.slug}' archivado y su BD eliminada`
        : `Tenant '${tenant.slug}' archivado (BD preservada: ${tenant.dbName})`,
    };
  }

}
