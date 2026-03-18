import {
  Injectable,
  Scope,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { GlobalCountry } from '../../control-plane/countries/entities/country.entity';
import { Country } from '../products/entities/country.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * Servicio de países a nivel de tenant (app-plane).
 *
 * - Lee la lista global de países desde control_plane.global_countries
 * - Gestiona la tabla countries local del tenant (agregar/quitar países)
 * - Los productos solo pueden referenciar países habilitados en el tenant
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantCountriesService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    @InjectDataSource('default') private readonly globalDS: DataSource,
  ) {}

  /**
   * Lista todos los países disponibles globalmente (para selector del admin del tenant).
   */
  async findAllGlobal(): Promise<GlobalCountry[]> {
    return this.globalDS
      .getRepository(GlobalCountry)
      .find({ order: { name: 'ASC' } });
  }

  /**
   * Lista los países habilitados en este tenant.
   */
  async findAllTenant(): Promise<Country[]> {
    const ds = await this.tenantConnection.getTenantConnection();
    return ds.getRepository(Country).find({ order: { name: 'ASC' } });
  }

  /**
   * Agrega un país al tenant copiando sus datos desde la lista global.
   */
  async addCountry(code: string, actorMemberId?: string): Promise<Country> {
    const upperCode = code.toUpperCase();

    // 1. Buscar en la lista global
    const global = await this.globalDS
      .getRepository(GlobalCountry)
      .findOne({ where: { code: upperCode } });

    if (!global) {
      throw new NotFoundException(
        `No existe un país con código '${upperCode}' en la lista global. Ejecute el seed primero.`,
      );
    }

    // 2. Verificar que no esté ya en el tenant
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Country);
    const existing = await repo.findOne({ where: { id: upperCode } });

    if (existing) {
      throw new BadRequestException(
        `El país '${upperCode} - ${global.name}' ya está habilitado en este tenant.`,
      );
    }

    // 3. Copiar al tenant
    const country = repo.create({
      id: global.code,
      name: global.name,
      timezone: global.timezone,
    });

    const saved = await repo.save(country);

    try {
      await ds.getRepository(AuditLog).save(
        ds.getRepository(AuditLog).create({
          actorMemberId: actorMemberId ?? null,
          entity: 'country',
          entityId: saved.id,
          action: 'CREATE',
          changes: { code: saved.id, name: saved.name },
        }),
      );
    } catch { /* best-effort */ }

    return saved;
  }

  /**
   * Agrega múltiples países al tenant de una sola vez.
   * Ignora los que ya existen (no lanza error).
   */
  async bulkAddCountries(
    codes: string[],
    actorMemberId?: string,
  ): Promise<{ added: string[]; skipped: string[]; notFound: string[] }> {
    const upperCodes = codes.map((c) => c.toUpperCase());
    const added: string[] = [];
    const skipped: string[] = [];
    const notFound: string[] = [];

    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Country);
    const globalRepo = this.globalDS.getRepository(GlobalCountry);

    for (const code of upperCodes) {
      const global = await globalRepo.findOne({ where: { code } });
      if (!global) {
        notFound.push(code);
        continue;
      }

      const existing = await repo.findOne({ where: { id: code } });
      if (existing) {
        skipped.push(code);
        continue;
      }

      await repo.save(
        repo.create({ id: global.code, name: global.name, timezone: global.timezone }),
      );
      added.push(code);

      try {
        await ds.getRepository(AuditLog).save(
          ds.getRepository(AuditLog).create({
            actorMemberId: actorMemberId ?? null,
            entity: 'country',
            entityId: code,
            action: 'CREATE',
            changes: { code, name: global.name },
          }),
        );
      } catch { /* best-effort */ }
    }

    return { added, skipped, notFound };
  }

  /**
   * Detecta países de las organizaciones del tenant que aún NO están
   * habilitados como ámbito operacional.
   *
   * Ejemplo de uso: el admin del tenant ve "Detectamos orgs de MX, DE, CR —
   * ¿Quieres agregar estos países al ámbito del tenant?"
   *
   * Regla de negocio: las sugerencias son informativas, no auto-aplicadas.
   * El admin decide qué agregar con POST /countries/bulk.
   */
  async getSuggestions(): Promise<{
    suggestions: GlobalCountry[];
    message: string;
  }> {
    const ds = await this.tenantConnection.getTenantConnection();

    // 1. Obtener los ISO codes de las orgs locales que tienen country_id
    const orgRows: { country_id: string }[] = await ds.query(
      `SELECT DISTINCT country_id FROM workspace_organizations WHERE country_id IS NOT NULL`,
    );
    const orgCodes = orgRows.map((r) => r.country_id);

    if (orgCodes.length === 0) {
      return { suggestions: [], message: 'Las organizaciones del tenant no tienen país de origen registrado.' };
    }

    // 2. Obtener los códigos ya habilitados en el tenant
    const tenantRows: { id: string }[] = await ds.query(
      `SELECT id FROM countries`,
    );
    const tenantCodes = new Set(tenantRows.map((r) => r.id));

    // 3. Filtrar los que AÚN NO están habilitados
    const pendingCodes = orgCodes.filter((c) => !tenantCodes.has(c));

    if (pendingCodes.length === 0) {
      return { suggestions: [], message: 'Todos los países de las organizaciones ya están habilitados.' };
    }

    // 4. Buscar la metadata global para presentarla en el UI
    const globalRepo = this.globalDS.getRepository(GlobalCountry);
    const suggestions = await Promise.all(
      pendingCodes.map((code) => globalRepo.findOne({ where: { code } }))
    );

    const found = suggestions.filter(Boolean) as GlobalCountry[];

    return {
      suggestions: found,
      message: `${found.length} países detectados desde organizaciones participantes que aún no están habilitados.`,
    };
  }

  /**
   * Elimina un país del tenant.
   * Falla si hay productos que lo referencian.
   */
  async removeCountry(code: string, actorMemberId?: string): Promise<void> {
    const upperCode = code.toUpperCase();
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Country);

    const country = await repo.findOne({ where: { id: upperCode } });
    if (!country) {
      throw new NotFoundException(
        `El país '${upperCode}' no está habilitado en este tenant.`,
      );
    }

    // Verificar que no haya productos referenciando este país
    const productCount = await ds.query(
      `SELECT COUNT(*) as count FROM products WHERE country_id = $1`,
      [upperCode],
    );

    if (parseInt(productCount[0].count) > 0) {
      throw new BadRequestException(
        `Cannot delete '${upperCode}' because ${productCount[0].count} product(s) still reference it. Reassign the products first.`,
      );
    }

    await repo.remove(country);

    try {
      await ds.getRepository(AuditLog).save(
        ds.getRepository(AuditLog).create({
          actorMemberId: actorMemberId ?? null,
          entity: 'country',
          entityId: upperCode,
          action: 'DELETE',
          changes: { code: upperCode, name: country.name },
        }),
      );
    } catch { /* best-effort */ }
  }
}
