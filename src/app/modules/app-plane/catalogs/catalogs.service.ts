import { Injectable, BadRequestException, NotFoundException, Scope, Inject } from '@nestjs/common';

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

  // --- CREAR (Transacción) ---
  async createCatalogWithItems(data: { name: string; code: string; items: string[] }) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar duplicados y códigos reservados
      const codeUpper = data.code.toUpperCase();
      const reservedCodes = ['TASK_STATUS', 'TASK_PHASES'];
      
      if (reservedCodes.includes(codeUpper)) {
        throw new BadRequestException(`El código ${codeUpper} está reservado para catálogos del sistema.`);
      }
      
      const existing = await queryRunner.manager.findOne(Catalog, { 
        where: { code: codeUpper } 
      });
      if (existing) throw new BadRequestException(`El catálogo ${data.code} ya existe.`);

      // Crear Cabecera
      const catalog = queryRunner.manager.create(Catalog, {
        name: data.name,
        code: data.code.toUpperCase(),
      });
      const savedCatalog = await queryRunner.manager.save(catalog);

      // Crear Items
      const itemsToSave = data.items.map(itemName => {
        return queryRunner.manager.create(CatalogItem, {
          name: itemName,
          code: itemName.toUpperCase().replace(/\s+/g, '_').substring(0, 10),
          catalog: savedCatalog
        });
      });

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
