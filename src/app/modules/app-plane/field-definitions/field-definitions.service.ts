import { Injectable, BadRequestException, NotFoundException, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { ProductFieldDefinition } from './entities/product-field-definition.entity';
import { Catalog } from '../catalogs/entities/catalog.entity';
import { In } from 'typeorm';

@Injectable({ scope: Scope.REQUEST }) // 👈 Scope Request
export class FieldDefinitionsService {
  constructor(
    private tenantConnection: TenantConnectionService // 👈 Switch
  ) {}

  async createDefinition(data: { 
    key: string; 
    label: string; 
    type: string; 
    linkedCatalogCode?: string;
    linkedCatalogId?: string;
    required?: boolean;
    order?: number;
  }) {
    // Obtenemos conexión
    const dataSource = await this.tenantConnection.getTenantConnection();
    const fieldRepo = dataSource.getRepository(ProductFieldDefinition);
    const catalogRepo = dataSource.getRepository(Catalog);
    
    // Validación de Integridad para CATALOG_REF
    if (data.type === 'CATALOG_REF') {
        if (data.linkedCatalogId) {
            // Ruta preferida: validar por UUID
            const catalog = await catalogRepo.findOne({ where: { id: data.linkedCatalogId } });
            if (!catalog) {
                throw new BadRequestException(
                    `El catálogo con id '${data.linkedCatalogId}' no existe en tu cuenta.`,
                );
            }
            // Auto-poblar linkedCatalogCode para compatibilidad
            data.linkedCatalogCode = catalog.code;
        } else if (data.linkedCatalogCode) {
            // Ruta legacy: resolver code → id
            const catalog = await catalogRepo.findOne({ where: { code: data.linkedCatalogCode } });
            if (!catalog) {
                throw new BadRequestException(
                    `El catálogo '${data.linkedCatalogCode}' no existe en tu cuenta. Créalo primero.`,
                );
            }
            data.linkedCatalogId = catalog.id;
        } else {
            throw new BadRequestException(
                'Falta linkedCatalogId o linkedCatalogCode para el campo tipo Catálogo',
            );
        }
    }

    // Evitar claves duplicadas
    const existingKey = await fieldRepo.findOne({ where: { key: data.key } });
    if (existingKey) {
        throw new BadRequestException(`Ya existe un campo con la clave '${data.key}' para tus proyectos.`);
    }

    // Auto-assign next order if not provided
    if (data.order === undefined || data.order === null) {
      const maxOrder = await fieldRepo
        .createQueryBuilder('fd')
        .select('COALESCE(MAX(fd.order), -1)', 'maxOrder')
        .getRawOne();
      data.order = (maxOrder?.maxOrder ?? -1) + 1;
    }

    const field = fieldRepo.create(data);
    return fieldRepo.save(field);
  }

  async getProjectTemplate() {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(ProductFieldDefinition).find({ order: { order: 'ASC' } });
  }

  async updateDefinition(
    id: string,
    data: { label?: string; linkedCatalogCode?: string; linkedCatalogId?: string; required?: boolean; order?: number },
  ) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(ProductFieldDefinition);

    const field = await repo.findOne({ where: { id } });
    if (!field) {
      throw new NotFoundException(`Campo con id '${id}' no encontrado`);
    }

    // Resolver catálogo vinculado si se está cambiando
    if (field.type === 'CATALOG_REF') {
      const catalogRepo = dataSource.getRepository(Catalog);

      if (data.linkedCatalogId !== undefined) {
        // Ruta preferida: validar por UUID
        const catalog = await catalogRepo.findOne({ where: { id: data.linkedCatalogId } });
        if (!catalog) {
          throw new BadRequestException(
            `El catálogo con id '${data.linkedCatalogId}' no existe en tu cuenta.`,
          );
        }
        data.linkedCatalogCode = catalog.code;
      } else if (data.linkedCatalogCode !== undefined) {
        // Ruta legacy: resolver code → id
        const catalog = await catalogRepo.findOne({ where: { code: data.linkedCatalogCode } });
        if (!catalog) {
          throw new BadRequestException(
            `El catálogo '${data.linkedCatalogCode}' no existe en tu cuenta.`,
          );
        }
        data.linkedCatalogId = catalog.id;
      }
    }

    Object.assign(field, data);
    return repo.save(field);
  }

  async removeDefinition(id: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(ProductFieldDefinition);

    const field = await repo.findOne({ where: { id } });
    if (!field) {
      throw new NotFoundException(`Campo con id '${id}' no encontrado`);
    }

    await repo.remove(field);
    return { deleted: true };
  }

  async reorderDefinitions(orderedIds: string[]) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(ProductFieldDefinition);

    // Validate all IDs exist
    const fields = await repo.find({ where: { id: In(orderedIds) } });
    if (fields.length !== orderedIds.length) {
      throw new BadRequestException('Algunos IDs de campo no existen');
    }

    // Batch update order
    const updates = orderedIds.map((id, index) =>
      repo.update(id, { order: index }),
    );
    await Promise.all(updates);

    return repo.find({ order: { order: 'ASC' } });
  }
}