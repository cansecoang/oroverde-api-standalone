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
  tax_id: string;
}

export interface UserUpdatedPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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
          `UPDATE workspace_organizations SET name = $1, tax_id = $2 WHERE global_reference_id = $3`,
          [payload.name, payload.tax_id, payload.id],
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

    const fullName = `${payload.firstName} ${payload.lastName}`;
    let successCount = 0;

    for (const membership of memberships) {
      const tenant = membership.tenant;
      try {
        const result = await this.executeOnTenantDb(
          tenant.dbName,
          `UPDATE workspace_members SET email = $1, full_name = $2 WHERE "userId" = $3`,
          [payload.email, fullName, payload.id],
        );
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
