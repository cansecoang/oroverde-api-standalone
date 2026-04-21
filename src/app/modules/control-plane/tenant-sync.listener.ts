import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'pg';
import { Tenant } from './tenants/entities/tenant.entity';
import { TenantMember } from './tenants/entities/tenant-member.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

export interface OrganizationUpdatedPayload {
  id: string;
  name: string;
  countryId: string | null;
}

export interface OrganizationDeletedPayload {
  id: string;
  name: string;
}

export interface UserUpdatedPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string | null;
}

export interface UserDeletedPayload {
  id: string;
  email: string;
}

export interface CountryUpdatedPayload {
  code: string;
  name: string;
  timezone: string | null;
}

export interface CountryDeletedPayload {
  code: string;
}

@Injectable()
export class TenantSyncListener {
  private readonly logger = new Logger(TenantSyncListener.name);

  constructor(
    @InjectRepository(Tenant, 'default')
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantMember, 'default')
    private readonly tenantMemberRepo: Repository<TenantMember>,
  ) {}

  // ─── ORGANIZACIÓN ACTUALIZADA ─────────────────────────────
  // Se propaga a TODOS los tenants activos porque cualquiera
  // puede tener un espejo de esa organización.
  @OnEvent('organization.updated', { async: true })
  async handleOrganizationUpdated(payload: OrganizationUpdatedPayload) {
    this.logger.log(
      `🔄 Propagando 'organization.updated' (${payload.id}) a silos de tenants...`,
    );

    const tenants = await this.tenantRepo.find({
      where: { status: TenantStatus.ACTIVE },
      select: ['id', 'dbName', 'slug'],
    });

    let successCount = 0;
    let skipCount = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.executeOnTenantDb(
          tenant.dbName,
          `UPDATE workspace_organizations SET name = $1, country_id = $2 WHERE global_reference_id = $3`,
          [payload.name, payload.countryId, payload.id],
        );
        if (result > 0) {
          successCount++;
          this.logger.log(
            `  ✅ [${tenant.slug}] workspace_organizations actualizado (${result} fila(s))`,
          );
        } else {
          skipCount++;
        }
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error propagando organización: ${error.message}`,
        );
        // Continuar con el siguiente tenant — no abortar la propagación
      }
    }

    this.logger.log(
      `🔄 Propagación 'organization.updated' completada: ${successCount} actualizados, ${skipCount} sin coincidencia, de ${tenants.length} tenants`,
    );
  }

  // ─── ORGANIZACIÓN ELIMINADA ───────────────────────────────
  // Elimina la copia local de workspace_organizations solo si no hay
  // dependencias (productos, miembros) que la referencien.
  @OnEvent('organization.deleted', { async: true })
  async handleOrganizationDeleted(payload: OrganizationDeletedPayload) {
    this.logger.log(
      `🗑 Propagando 'organization.deleted' (${payload.id}) a silos de tenants...`,
    );

    const tenants = await this.tenantRepo.find({
      where: { status: TenantStatus.ACTIVE },
      select: ['id', 'dbName', 'slug'],
    });

    let deletedCount = 0;
    let blockedCount = 0;

    for (const tenant of tenants) {
      try {
        const deleted = await this.executeOnTenantDb(
          tenant.dbName,
          `DELETE FROM workspace_organizations
           WHERE global_reference_id = $1
             AND is_tenant_owner = false
             AND id NOT IN (SELECT owner_organization_id FROM products WHERE owner_organization_id IS NOT NULL)
             AND id NOT IN (SELECT organization_id FROM workspace_members WHERE organization_id IS NOT NULL)`,
          [payload.id],
        );

        if (deleted > 0) {
          deletedCount++;
          this.logger.log(`  ✅ [${tenant.slug}] workspace_organizations eliminado (${deleted} fila(s))`);
        } else {
          // Check if row still exists (blocked by dependency)
          const existsCount = await this.executeOnTenantDb(
            tenant.dbName,
            `SELECT 1 FROM workspace_organizations WHERE global_reference_id = $1 LIMIT 1`,
            [payload.id],
          );
          if (existsCount > 0) {
            blockedCount++;
            this.logger.warn(
              `  ⚠ [${tenant.slug}] workspace_organizations con global_reference_id=${payload.id} no se eliminó (tiene dependencias activas)`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error eliminando organización: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `🗑 Propagación 'organization.deleted' completada: ${deletedCount} eliminados, ${blockedCount} bloqueados por dependencias, de ${tenants.length} tenants`,
    );
  }

  // ─── USUARIO ACTUALIZADO ──────────────────────────────────
  // Solo se propaga a los tenants donde el usuario es miembro
  // (eficiencia: JOIN tenant_members + tenants).
  @OnEvent('user.updated', { async: true })
  async handleUserUpdated(payload: UserUpdatedPayload) {
    this.logger.log(
      `🔄 Propagando 'user.updated' (${payload.id}) a silos relevantes...`,
    );

    // Descubrir en qué BDs existe este usuario
    const memberships = await this.tenantMemberRepo
      .createQueryBuilder('tm')
      .innerJoinAndSelect('tm.tenant', 't')
      .where('tm.userId = :userId', { userId: payload.id })
      .andWhere('t.status = :status', { status: TenantStatus.ACTIVE })
      .getMany();

    if (memberships.length === 0) {
      this.logger.log(`  ⏭ Usuario ${payload.id} no pertenece a ningún tenant activo`);
      return;
    }

    let successCount = 0;

    for (const membership of memberships) {
      const tenant = membership.tenant;
      try {
        // Propagate email + first_name + last_name always
        const result = await this.executeOnTenantDb(
          tenant.dbName,
          `UPDATE workspace_members SET email = $1, first_name = $2, last_name = $3 WHERE "userId" = $4`,
          [payload.email, payload.firstName, payload.lastName, payload.id],
        );

        // Propagate organization change: resolve global org → local workspace_organization
        if (payload.organizationId) {
          await this.executeOnTenantDb(
            tenant.dbName,
            `UPDATE workspace_members
             SET organization_id = (
               SELECT id FROM workspace_organizations
               WHERE global_reference_id = $1
               LIMIT 1
             )
             WHERE "userId" = $2
               AND EXISTS (
                 SELECT 1 FROM workspace_organizations
                 WHERE global_reference_id = $1
               )`,
            [payload.organizationId, payload.id],
          ).catch((err) => {
            this.logger.warn(
              `  ⚠ [${tenant.slug}] No se pudo actualizar organization_id en workspace_members: ${err.message}`,
            );
          });
        }

        if (result > 0) {
          successCount++;
          this.logger.log(
            `  ✅ [${tenant.slug}] workspace_members actualizado (${result} fila(s))`,
          );
        }
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error propagando usuario: ${error.message}`,
        );
        // Continuar con el siguiente tenant — no abortar la propagación
      }
    }

    this.logger.log(
      `🔄 Propagación 'user.updated' completada: ${successCount} de ${memberships.length} tenant(s)`,
    );
  }

  // ─── USUARIO ELIMINADO ────────────────────────────────────
  // Defensivo: borra workspace_members en silos donde el userId aún exista.
  // En operación normal es un no-op porque remove() en users.service.ts
  // exige que el usuario no tenga membresías activas antes de eliminarse.
  @OnEvent('user.deleted', { async: true })
  async handleUserDeleted(payload: UserDeletedPayload) {
    this.logger.log(
      `🗑 Propagando 'user.deleted' (${payload.id}) a silos relevantes...`,
    );

    const memberships = await this.tenantMemberRepo
      .createQueryBuilder('tm')
      .innerJoinAndSelect('tm.tenant', 't')
      .where('tm.userId = :userId', { userId: payload.id })
      .andWhere('t.status = :status', { status: TenantStatus.ACTIVE })
      .getMany();

    if (memberships.length === 0) {
      this.logger.log(`  ⏭ Usuario ${payload.id} sin membresías activas — nada que limpiar`);
      return;
    }

    let successCount = 0;

    for (const membership of memberships) {
      const tenant = membership.tenant;
      try {
        const deleted = await this.executeOnTenantDb(
          tenant.dbName,
          `DELETE FROM workspace_members WHERE "userId" = $1`,
          [payload.id],
        );
        successCount++;
        this.logger.log(
          `  ✅ [${tenant.slug}] workspace_members eliminado (${deleted} fila(s))`,
        );
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error eliminando workspace_member: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `🗑 Propagación 'user.deleted' completada: ${successCount} de ${memberships.length} tenant(s)`,
    );
  }

  // ─── PAÍS ACTUALIZADO ─────────────────────────────────────
  // Se propaga a TODOS los tenants activos. Un UPDATE con 0 rows
  // es silencioso — significa que el tenant no tiene ese país habilitado.
  @OnEvent('country.updated', { async: true })
  async handleCountryUpdated(payload: CountryUpdatedPayload) {
    this.logger.log(
      `🔄 Propagando 'country.updated' (${payload.code}) a silos de tenants...`,
    );

    const tenants = await this.tenantRepo.find({
      where: { status: TenantStatus.ACTIVE },
      select: ['id', 'dbName', 'slug'],
    });

    let successCount = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.executeOnTenantDb(
          tenant.dbName,
          `UPDATE countries SET name = $1, timezone = $2 WHERE id = $3`,
          [payload.name, payload.timezone, payload.code],
        );
        if (result > 0) {
          successCount++;
          this.logger.log(
            `  ✅ [${tenant.slug}] countries actualizado (${result} fila(s))`,
          );
        }
        // result = 0 → tenant no tiene ese país — silencioso
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error propagando país: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `🔄 Propagación 'country.updated' completada: ${successCount} silos actualizados de ${tenants.length} activos`,
    );
  }

  // ─── PAÍS ELIMINADO ───────────────────────────────────────
  // Solo elimina si ningún producto en el silo lo referencia.
  @OnEvent('country.deleted', { async: true })
  async handleCountryDeleted(payload: CountryDeletedPayload) {
    this.logger.log(
      `🗑 Propagando 'country.deleted' (${payload.code}) a silos de tenants...`,
    );

    const tenants = await this.tenantRepo.find({
      where: { status: TenantStatus.ACTIVE },
      select: ['id', 'dbName', 'slug'],
    });

    let deletedCount = 0;
    let blockedCount = 0;

    for (const tenant of tenants) {
      try {
        const deleted = await this.executeOnTenantDb(
          tenant.dbName,
          `DELETE FROM countries
           WHERE id = $1
             AND id NOT IN (
               SELECT country_id FROM products WHERE country_id IS NOT NULL
             )`,
          [payload.code],
        );

        if (deleted > 0) {
          deletedCount++;
          this.logger.log(
            `  ✅ [${tenant.slug}] countries eliminado (${deleted} fila(s))`,
          );
        } else {
          // Check if the row still exists (blocked by products) vs. not present
          const existsCount = await this.executeOnTenantDb(
            tenant.dbName,
            `SELECT 1 FROM countries WHERE id = $1 LIMIT 1`,
            [payload.code],
          );
          if (existsCount > 0) {
            blockedCount++;
            this.logger.warn(
              `  ⚠ [${tenant.slug}] countries id=${payload.code} no se eliminó (bloqueado por productos)`,
            );
          }
          // existsCount = 0 → tenant no tenía ese país — silencioso
        }
      } catch (error) {
        this.logger.error(
          `  ❌ [${tenant.slug}] Error eliminando país: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `🗑 Propagación 'country.deleted' completada: ${deletedCount} eliminados, ${blockedCount} bloqueados por productos, de ${tenants.length} activos`,
    );
  }

  // ─── CONEXIÓN DINÁMICA A BD DE TENANT ─────────────────────
  // Crea un cliente pg directo (no DataSource), ejecuta la query,
  // y cierra inmediatamente. Liviano y sin overhead de TypeORM.
  private async executeOnTenantDb(
    dbName: string,
    query: string,
    params: any[],
  ): Promise<number> {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432', 10);
    const user = process.env.DB_USER;
    const password = process.env.DB_PASS;
    const sslEnabled =
      process.env.DB_SSL === 'true' || host.includes('azure');

    const client = new Client({
      host,
      port,
      user,
      password,
      database: dbName,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    });

    try {
      await client.connect();
      const result = await client.query(query, params);
      return result.rowCount ?? 0;
    } finally {
      await client.end().catch(() => {});
    }
  }
}
