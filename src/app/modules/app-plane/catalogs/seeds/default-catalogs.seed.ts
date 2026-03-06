import { DataSource } from 'typeorm';
import { Catalog } from '../entities/catalog.entity';
import { CatalogItem } from '../entities/catalog-item.entity';

/**
 * Seed de catálogos por defecto para cada tenant nuevo.
 * Se pasa como TenantSeedCallback al TenantsService vía inyección de dependencias.
 *
 * ⚠️ IDEMPOTENTE: usa findOne + save condicional para no duplicar registros
 * si por alguna razón se llama más de una vez sobre la misma BD.
 */
export async function seedDefaultCatalogs(connection: DataSource): Promise<void> {
  const catalogRepo = connection.getRepository(Catalog);
  const itemRepo = connection.getRepository(CatalogItem);

  // ── Helper: obtener o crear catálogo ────────────────────────────────────
  async function upsertCatalog(data: {
    code: string;
    name: string;
    description: string;
    isSystem: boolean;
  }): Promise<Catalog> {
    const existing = await catalogRepo.findOne({ where: { code: data.code } });
    if (existing) {
      // Asegurar que is_system esté marcado correctamente en registros legados
      if (existing.isSystem !== data.isSystem) {
        existing.isSystem = data.isSystem;
        return catalogRepo.save(existing);
      }
      return existing;
    }
    return catalogRepo.save(catalogRepo.create(data));
  }

  // ── Helper: crear items solo si no existen ───────────────────────────────
  async function upsertItems(
    catalog: Catalog,
    items: { name: string; code: string; order: number }[],
  ): Promise<void> {
    for (const item of items) {
      const existing = await itemRepo.findOne({
        where: { catalog: { id: catalog.id }, code: item.code },
      });
      if (!existing) {
        await itemRepo.save(itemRepo.create({ ...item, catalog }));
      }
    }
  }

  // ── 1. Estatus de Tareas ────────────────────────────────────────────────
  const statusCatalog = await upsertCatalog({
    code: 'TASK_STATUS',
    name: 'Task Status',
    description: 'Task status options for project management',
    isSystem: true,
  });

  await upsertItems(statusCatalog, [
    { name: 'Not Started', code: 'NOT_STARTED', order: 1 },
    { name: 'In Progress', code: 'IN_PROGRESS', order: 2 },
    { name: 'On Hold',     code: 'ON_HOLD',     order: 3 },
    { name: 'Blocked',     code: 'BLOCKED',     order: 4 },
    { name: 'Reviewed',    code: 'REVIEWED',    order: 5 },
    { name: 'Completed',   code: 'COMPLETED',   order: 6 },
  ]);

  // ── 2. Fases de Tareas ──────────────────────────────────────────────────
  const phasesCatalog = await upsertCatalog({
    code: 'TASK_PHASES',
    name: 'Task Phases',
    description: 'Phases of tasks for workflow management',
    isSystem: true,
  });

  await upsertItems(phasesCatalog, [
    { name: 'Planning',    code: 'PLANNING',    order: 1 },
    { name: 'Elaboration', code: 'ELABORATION', order: 2 },
    { name: 'Completion',  code: 'COMPLETION',  order: 3 },
  ]);

  // ── 3. Países ─────────────────────────────────────────────────────────
  // NOTA: Los países ya NO se siembran automáticamente aquí.
  // El administrador del tenant los configura desde:
  //   POST /api/countries       → agregar uno
  //   POST /api/countries/bulk  → agregar varios
  // usando el catálogo global (GET /api/countries/global).

  // ── 4. Paquetes de Trabajo ──────────────────────────────────────────────
  // NOTA (H-2): WORK_PACKAGES eliminado del seed por defecto.
  // Se configurará como custom field específico por tenant (ej. BioFincas).
}
