import { Injectable, BadRequestException, NotFoundException, Scope, Inject } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TENANT_CONNECTION_TOKEN } from '../../../common/tokens/tenancy.tokens';
import { ITenantConnection } from '../../../common/interfaces/tenancy.interfaces';

import { Catalog } from './entities/catalog.entity';
import { CatalogItem } from './entities/catalog-item.entity';

@Injectable({ scope: Scope.REQUEST })
export class CatalogsService {
  
  constructor(
    @Inject(TENANT_CONNECTION_TOKEN)
    private tenantConnection: ITenantConnection
  ) {}

  /**
   * Normaliza un nombre a un código: mayúsculas, sin acentos, sin caracteres
   * especiales, espacios reemplazados por guiones bajos.
   */
  static generateCode(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // eliminar acentos
      .toUpperCase()
      .replace(/\s+/g, '_')              // espacios → _
      .replace(/[^A-Z0-9_]/g, '')        // solo alfanuméricos y _
      .replace(/^_+|_+$/g, '')           // recortar _ inicial/final
      || 'CATALOG';
  }

  /**
   * Garantiza unicidad del code de catálogo.
   * Si ya existe, agrega sufijo numérico incremental (_2, _3, …).
   */
  private async ensureUniqueCatalogCode(
    manager: EntityManager,
    baseCode: string,
  ): Promise<string> {
    let candidate = baseCode;
    let suffix = 1;
    while (await manager.findOne(Catalog, { where: { code: candidate } })) {
      suffix++;
      candidate = `${baseCode}_${suffix}`;
    }
    return candidate;
  }

  /**
   * Garantiza unicidad del code de item dentro de un catálogo.
   */
  private async ensureUniqueItemCode(
    manager: EntityManager,
    catalogId: string,
    baseCode: string,
  ): Promise<string> {
    let candidate = baseCode;
    let suffix = 1;
    while (
      await manager.findOne(CatalogItem, {
        where: { catalogId, code: candidate },
      })
    ) {
      suffix++;
      candidate = `${baseCode}_${suffix}`;
    }
    return candidate;
  }

  // --- CREAR (Transacción) ---
  async createCatalogWithItems(data: { name: string; code?: string; items?: string[] }) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Autogenerar código a partir del nombre (o del code provisto)
      const rawCode = data.code
        ? CatalogsService.generateCode(data.code)
        : CatalogsService.generateCode(data.name);

      // Validar códigos reservados
      const reservedCodes = ['TASK_STATUS', 'TASK_PHASES'];
      if (reservedCodes.includes(rawCode)) {
        throw new BadRequestException(`El código ${rawCode} está reservado para catálogos del sistema.`);
      }

      // Garantizar unicidad (agrega sufijo si ya existe)
      const catalogCode = await this.ensureUniqueCatalogCode(queryRunner.manager, rawCode);

      // Crear Cabecera
      const catalog = queryRunner.manager.create(Catalog, {
        name: data.name,
        code: catalogCode,
      });
      const savedCatalog = await queryRunner.manager.save(catalog);

      // Crear Items con código autogenerado y único dentro del catálogo
      const itemsToSave: CatalogItem[] = [];
      for (const itemName of (data.items ?? [])) {
        const baseItemCode = CatalogsService.generateCode(itemName);
        const itemCode = await this.ensureUniqueItemCode(
          queryRunner.manager,
          savedCatalog.id,
          baseItemCode,
        );
        itemsToSave.push(
          queryRunner.manager.create(CatalogItem, {
            name: itemName,
            code: itemCode,
            catalog: savedCatalog,
          }),
        );
      }

      await queryRunner.manager.save(itemsToSave);
      await queryRunner.commitTransaction();

      return { 
        msg: 'Catálogo creado exitosamente en tu BD privada', 
        catalog: savedCatalog,
        optionsCount: itemsToSave.length
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // --- LISTAR TODOS (solo catálogos editables, excluye catálogos del sistema) ---
  async findAll() {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource
      .getRepository(Catalog)
      .find({ 
        where: { isSystem: false },
        relations: ['items'], 
        order: { name: 'ASC' } 
      });
  }

  // --- BUSCAR POR CÓDIGO ---
  async findByCode(code: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const catalog = await dataSource
      .getRepository(Catalog)
      .findOne({ 
        where: { code: code.toUpperCase() },
        relations: ['items'] 
      });

    if (!catalog) {
      throw new NotFoundException(`El catálogo '${code}' no fue encontrado.`);
    }

    return catalog;
  }

  // --- AGREGAR ITEM ---
  async addItem(catalogId: string, name: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const manager = dataSource.manager;

    const catalog = await manager.findOne(Catalog, { where: { id: catalogId, isSystem: false } });
    if (!catalog) throw new NotFoundException('Catálogo no encontrado.');

    const baseCode = CatalogsService.generateCode(name);
    const code = await this.ensureUniqueItemCode(manager, catalogId, baseCode);

    const maxOrder = await manager
      .createQueryBuilder(CatalogItem, 'i')
      .select('MAX(i.order)', 'max')
      .where('i.catalog_id = :catalogId', { catalogId })
      .getRawOne<{ max: number | null }>();

    const item = manager.create(CatalogItem, {
      name,
      code,
      catalogId,
      order: (maxOrder?.max ?? 0) + 1,
    });
    return manager.save(item);
  }

  // --- ACTUALIZAR ITEM ---
  async updateItem(itemId: string, name: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const manager = dataSource.manager;

    const item = await manager.findOne(CatalogItem, {
      where: { id: itemId },
      relations: ['catalog'],
    });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    if (item.catalog?.isSystem) throw new BadRequestException('No se puede editar un catálogo de sistema.');

    item.name = name;
    return manager.save(item);
  }

  // --- ELIMINAR ITEM ---
  async deleteItem(itemId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const manager = dataSource.manager;

    const item = await manager.findOne(CatalogItem, {
      where: { id: itemId },
      relations: ['catalog'],
    });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    if (item.catalog?.isSystem) throw new BadRequestException('No se puede eliminar un ítem de catálogo de sistema.');

    await manager.remove(item);
    return { msg: 'Ítem eliminado.' };
  }

  async getItemsByType(type: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    return dataSource.getRepository(CatalogItem).find({
      where: { 
        catalog: { code: type }
      },
      order: { order: 'ASC' },
      select: ['id', 'name', 'code']
    });
  }
}
