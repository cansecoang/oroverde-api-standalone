import { Injectable, Scope, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Tenant } from '../control-plane/tenants/entities/tenant.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

// Entidades centralizadas del App Plane (fuente única de verdad)
import { APP_PLANE_ENTITIES } from '../app-plane/app-plane-entities';

// ─── POOL ESTÁTICO DE CONEXIONES ───
// Se comparte entre todas las instancias REQUEST-scoped del servicio
const dataSourcePool = new Map<string, DataSource>();
const POOL_IDLE_TIMEOUT = 1000 * 60 * 30; // 30 min sin uso → cerrar
const lastUsed = new Map<string, number>();

// Limpieza periódica de conexiones inactivas (cada 5 min)
const idleTimer = setInterval(async () => {
  const now = Date.now();
  for (const [slug, ts] of lastUsed.entries()) {
    if (now - ts > POOL_IDLE_TIMEOUT) {
      const ds = dataSourcePool.get(slug);
      if (ds?.isInitialized) {
        await ds.destroy().catch(() => {});
        Logger.log(`♻️ Pool: conexión idle cerrada → ${slug}`, 'TenantPool');
      }
      dataSourcePool.delete(slug);
      lastUsed.delete(slug);
    }
  }
}, 1000 * 60 * 5);

// M-6: Evitar que el timer bloquee el cierre de Node.js
if (idleTimer.unref) idleTimer.unref();

/**
 * M-6: Cierra TODAS las conexiones del pool (llamar en shutdown).
 */
export async function drainTenantPool(): Promise<void> {
  clearInterval(idleTimer);
  const entries = [...dataSourcePool.entries()];
  Logger.log(`🛑 Drenando pool de tenant — ${entries.length} conexiones`, 'TenantPool');
  await Promise.allSettled(
    entries.map(async ([slug, ds]) => {
      if (ds.isInitialized) {
        await ds.destroy();
        Logger.log(`🔌 Cerrada conexión: ${slug}`, 'TenantPool');
      }
    }),
  );
  dataSourcePool.clear();
  lastUsed.clear();
}

// Reutiliza la lista central — elimina duplicación y riesgo de desincronización
const TENANT_ENTITIES = [...APP_PLANE_ENTITIES];

@Injectable({ scope: Scope.REQUEST })
export class TenantConnectionService {
  private readonly logger = new Logger(TenantConnectionService.name);

  constructor(
    @Inject(REQUEST) private request: any,
    @InjectDataSource('default') private controlPlaneConnection: DataSource
  ) {}

  async getTenantConnection(): Promise<DataSource> {
    const tenantSlug = this.request.tenantId; // Header: x-tenant-id

    // 1. Verificar si ya existe en el pool
    const cached = dataSourcePool.get(tenantSlug);
    if (cached?.isInitialized) {
      lastUsed.set(tenantSlug, Date.now());
      return cached;
    }

    // 2. Buscar tenant en Control Plane
    const tenant = await this.controlPlaneConnection
      .getRepository(Tenant)
      .findOne({ where: { slug: tenantSlug } });

    if (!tenant) {
      throw new Error(`Tenant '${tenantSlug}' not found in Control Plane`);
    }

    // 2.5 Verificar que el tenant esté ACTIVO (cierra C-3 / T-8)
    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new Error(
        `Tenant '${tenantSlug}' is ${tenant.status}. Access denied.`,
      );
    }

    // 3. Crear DataSource y guardarlo en pool
    const dbSync = process.env.DB_SYNCHRONIZE === 'true';
    const connection = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: tenant.dbName,
      entities: TENANT_ENTITIES,
      synchronize: dbSync,
    });

    await connection.initialize();
    dataSourcePool.set(tenantSlug, connection);
    lastUsed.set(tenantSlug, Date.now());

    this.logger.log(`🔌 Connected to SILO DB: ${tenant.dbName} (pooled)`);
    return connection;
  }
}