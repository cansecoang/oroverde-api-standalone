import { Injectable, BadRequestException, NotFoundException, Scope, Logger } from '@nestjs/common';
import { In, DataSource, QueryRunner } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductMember } from './entities/product-member.entity';
import { ProductCustomOrgLink } from './entities/product-custom-org-link.entity';
import { ProductCustomValue } from './entities/product-custom-value.entity';
import { ProductFieldDefinition } from '../field-definitions/entities/product-field-definition.entity';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CustomFieldValueDto } from './dto/custom-field-value.dto';
import { CustomOrgFieldDto } from './dto/custom-link-field.dto';
import { ProductRole } from '../../../common/enums/business-roles.enum';
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';
import { CatalogItem } from '../catalogs/entities/catalog-item.entity';
import { MatrixQueryDto } from './dto/matrix-query.dto';
import {
  MatrixResponseDto,
  MatrixIndicatorDto,
  MatrixGroupDto,
  MatrixProductDto,
  MatrixCellDto,
  GroupByOptionDto,
  CatalogFilterOptionDto,
  MatrixOutputOptionDto,
} from './dto/matrix-response.dto';
import {
  resolveGroupByStrategy,
  getBaseStrategyKeys,
  getBaseStrategyLabel,
} from './matrix/group-by.strategy';

function compareHierarchicalCode(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aSeg = aParts[i];
    const bSeg = bParts[i];

    if (aSeg === undefined) return -1;
    if (bSeg === undefined) return 1;

    const aIsInt = /^\d+$/.test(aSeg);
    const bIsInt = /^\d+$/.test(bSeg);

    if (aIsInt && bIsInt) {
      const diff = Number(aSeg) - Number(bSeg);
      if (diff !== 0) return diff;
      continue;
    }

    const lex = aSeg.localeCompare(bSeg, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (lex !== 0) return lex;
  }

  return 0;
}

@Injectable({ scope: Scope.REQUEST })
export class ProductsService {
  constructor(private tenantConnection: TenantConnectionService) {}

  // ⚠️ NOTA: 'memberId' es el ID LOCAL del WorkspaceMember, no el GlobalUser ID.
  // El Controller deberá resolverlo a partir del token del usuario autenticado.
  async create(dto: CreateProductDto, memberId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const SUPER_ADMIN_SENTINEL = '00000000-0000-0000-0000-000000000000';
    
    // ---------------------------------------------------------
    // PASO 1: VALIDACIÓN (Fuera de la transacción para fallar rápido)
    // ---------------------------------------------------------
    await this.validateProductDto(dto);

    // ---------------------------------------------------------
    // PASO 2: TRANSACCIÓN (Producto + Auditoría)
    // ---------------------------------------------------------
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // A. Extraer campos especiales antes de crear el producto
      const {
        participatingOrganizationIds,
        customOrgFields,
        customValues,
        ...productData
      } = dto;

      // B. Guardar el Producto
      const newProduct = queryRunner.manager.create(Product, productData);
      const savedProduct = await queryRunner.manager.save(newProduct);

      // C. Asignar organizaciones participantes si se enviaron
      if (participatingOrganizationIds?.length) {
        const orgRepo = queryRunner.manager.getRepository(WorkspaceOrganization);
        const orgs = await orgRepo.findBy({ id: In(participatingOrganizationIds) });
        
        // Validar que todas las organizaciones existan
        if (orgs.length !== participatingOrganizationIds.length) {
          const foundIds = orgs.map(o => o.id);
          const missingIds = participatingOrganizationIds.filter(id => !foundIds.includes(id));
          throw new BadRequestException(
            `Las siguientes organizaciones no existen: ${missingIds.join(', ')}`
          );
        }
        
        savedProduct.participatingOrganizations = orgs;
        await queryRunner.manager.save(savedProduct);
      }

      // D. Registrar al creador como miembro del producto (coordinador)
      // Omitir si el memberId es el sentinel de SUPER_ADMIN (no existe en workspace_members)
      if (memberId !== SUPER_ADMIN_SENTINEL) {
        const ownerMember = queryRunner.manager.create(ProductMember, {
          memberId: memberId,
          productId: savedProduct.id,
          productRole: ProductRole.PRODUCT_COORDINATOR,
        });
        await queryRunner.manager.save(ownerMember);
      }

      // E. Sincronizar campos custom M:N (ORG_MULTI)
      await this.syncCustomLinks(queryRunner, savedProduct.id, customOrgFields);

      // E2. Guardar campos custom escalares en product_custom_values.
      if (customValues?.length) {
        await this.saveCustomValues(queryRunner, savedProduct.id, customValues);
      }

      // F. Guardar el Log de Auditoría
      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: memberId !== SUPER_ADMIN_SENTINEL ? memberId : null,
        action: 'CREATE',
        entity: 'PRODUCT',
        entityId: savedProduct.id,
        changes: {
          name: savedProduct.name,
          description: savedProduct.description,
          customValues: customValues ?? [],
          customOrgFields: customOrgFields ?? [],
        }
      });
      await queryRunner.manager.save(auditLog);

      await queryRunner.commitTransaction();
      
      // Retornar con relaciones cargadas
      return this.findOne(savedProduct.id);

    } catch (err) {
      await queryRunner.rollbackTransaction();
      
      // Registrar intento fallido en audit log (fuera de transacción)
      try {
        const auditLog = dataSource.getRepository(AuditLog).create({
          actorMemberId: memberId !== SUPER_ADMIN_SENTINEL ? memberId : null,
          action: 'CREATE_FAILED',
          entity: 'PRODUCT',
          entityId: null,
          changes: {
            error: err instanceof Error ? err.message : 'Unknown error',
            payload: {
              name: dto.name,
              ownerOrganizationId: dto.ownerOrganizationId,
              countryId: dto.countryId,
            },
          },
        });
        await dataSource.getRepository(AuditLog).save(auditLog);
      } catch (auditErr) {
        // Silenciar errores de auditoría para no ocultar el error original
      }
      
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Valida un CreateProductDto sin crear el producto (dry-run).
   * Retorna la lista de errores encontrados en vez de lanzar excepciones.
   */
  async validate(dto: CreateProductDto): Promise<{ valid: boolean; errors: any[] }> {
    const errors: any[] = [];

    try {
      await this.validateProductDto(dto);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse() as any;
        errors.push({
          field: 'validation',
          message: response.message || error.message,
        });
      } else {
        errors.push({
          field: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      return { valid: false, errors };
    }
  }

  async findAll(
    page = 1,
    limit = 50,
    search?: string,
    organizationId?: string,
    countryId?: string,
  ) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(Product);

    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
    const cappedLimit = Math.min(safeLimit, 100);
    
    const qb = repo.createQueryBuilder('product');

    if (search?.trim()) {
      qb.andWhere('(product.name ILIKE :search OR product.description ILIKE :search)', {
        search: `%${search.trim()}%`,
      });
    }

    if (organizationId) {
      if (organizationId === 'none') {
        qb.andWhere('product.ownerOrganizationId IS NULL');
      } else {
        qb.andWhere('product.ownerOrganizationId = :organizationId', { organizationId });
      }
    }

    if (countryId) {
      if (countryId === 'none') {
        qb.andWhere('product.countryId IS NULL');
      } else {
        qb.andWhere('product.countryId = :countryId', { countryId });
      }
    }

    const total = await qb.clone().getCount();
    const totalPages = Math.max(1, Math.ceil(total / cappedLimit));
    const effectivePage = Math.min(safePage, totalPages);

    const idRows: Array<{ id: string }> = await qb
      .clone()
      .select('product.id', 'id')
      .orderBy('product.name', 'ASC')
      .skip((effectivePage - 1) * cappedLimit)
      .take(cappedLimit)
      .getRawMany();

    const pagedIds = idRows.map((row) => row.id);
    let items: Product[] = [];

    if (pagedIds.length > 0) {
      items = await repo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.country', 'country')
        .leftJoinAndSelect('product.ownerOrganization', 'ownerOrg')
        .where('product.id IN (:...ids)', { ids: pagedIds })
        .getMany();

      // Preservar orden paginado por nombre.
      const orderMap = new Map(pagedIds.map((id, index) => [id, index]));
      items.sort(
        (a, b) =>
          (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    // Enriquecer attributes desde la nueva tabla EAV (product_custom_values)
    // sin romper el formato legacy esperado por frontend.
    const customValueProductIds = items.map((item) => item.id);
    const customValueRows = customValueProductIds.length
      ? await dataSource.getRepository(ProductCustomValue).find({
          where: { productId: In(customValueProductIds) },
          relations: ['fieldDefinition'],
        })
      : [];

    const byProductId = new Map<string, ProductCustomValue[]>();
    for (const row of customValueRows) {
      const bucket = byProductId.get(row.productId) ?? [];
      bucket.push(row);
      byProductId.set(row.productId, bucket);
    }

    const itemsWithCustomValues = items.map((item) => ({
      ...item,
      attributes: this.transformCustomValuesToMap(byProductId.get(item.id)),
    }));

    return {
      items: itemsWithCustomValues,
      total,
      page: effectivePage,
      limit: cappedLimit,
      totalPages,
    };
  }

  /**
   * Obtiene un producto por su ID con todas las relaciones cargadas.
   * Incluye campos custom M:N transformados por key del field definition.
   */
  async findOne(id: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(Product);

    const product = await repo.findOne({
      where: { id },
      relations: [
        'country',
        'ownerOrganization',
        'participatingOrganizations',
        'members',
        'members.member',
        'members.member.organization',
        'strategies',
        'strategies.indicator',
        'customValues',
        'customValues.fieldDefinition',
        'customValues.catalogItem',
      ],
    });

    if (!product) {
      throw new NotFoundException(`Producto con ID '${id}' no encontrado.`);
    }

    // ── Cargar campos custom M:N y transformar por key ──────────────
    const customLinksData = await this.loadCustomLinks(dataSource, id);

    // ── Transformar EAV rows → objeto key-value (compatible con frontend) ──
    const customValuesMap = this.transformCustomValuesToMap(product.customValues);

    return {
      ...product,
      attributes: customValuesMap,
      customLinks: customLinksData,
    };
  }

  /**
   * Actualiza un producto existente.
   * Los `attributes` se fusionan con los existentes (no se reemplazan).
   */
  async update(id: string, dto: UpdateProductDto, memberId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    // Verificar que el producto exista
    const repo = dataSource.getRepository(Product);
    const existing = await repo.findOne({
      where: { id },
      relations: ['participatingOrganizations'],
    });
    if (!existing) {
      throw new NotFoundException(`Producto con ID '${id}' no encontrado.`);
    }

    // Validar campos custom si se enviaron
    if (dto.customValues) {
      const defRepo = dataSource.getRepository(ProductFieldDefinition);
      const definitions = await defRepo.find();
      await this.validateCustomValueDtos(dto.customValues, definitions, dataSource);
    }

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { participatingOrganizationIds, customOrgFields, customValues, ...standardFields } = dto;

      // A. Actualizar campos estándar
      if (Object.keys(standardFields).length > 0) {
        await queryRunner.manager.update(Product, id, standardFields);
      }

      // B. Actualizar organizaciones participantes si se enviaron
      if (participatingOrganizationIds !== undefined) {
        const product = await queryRunner.manager.findOne(Product, {
          where: { id },
          relations: ['participatingOrganizations'],
        });
        if (product) {
          if (participatingOrganizationIds.length === 0) {
            product.participatingOrganizations = [];
          } else {
            const orgRepo = queryRunner.manager.getRepository(WorkspaceOrganization);
            product.participatingOrganizations = await orgRepo.findBy({ id: In(participatingOrganizationIds) });
          }
          await queryRunner.manager.save(product);
        }
      }

      // D. Sincronizar campos custom M:N (ORG_MULTI)
      if (customOrgFields !== undefined) {
        await this.syncCustomLinks(queryRunner, id, customOrgFields);
      }

      // D2. Sincronizar campos custom escalares en product_custom_values.
      if (customValues !== undefined) {
        await this.syncCustomValues(queryRunner, id, customValues);
      }

      // E. Auditoría
      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: memberId,
        action: 'UPDATE',
        entity: 'PRODUCT',
        entityId: id,
        changes: {
          ...standardFields,
          ...(customValues ? { customValues } : {}),
          ...(customOrgFields ? { customOrgFields } : {}),
        },
      });
      await queryRunner.manager.save(auditLog);

      await queryRunner.commitTransaction();
      return this.findOne(id);

    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Elimina un producto (hard delete).
   * Las relaciones con cascade (members) se eliminan automáticamente.
   */
  async remove(id: string, memberId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(Product);

    const product = await repo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Producto con ID '${id}' no encontrado.`);
    }

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Auditoría antes de eliminar
      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: memberId,
        action: 'DELETE',
        entity: 'PRODUCT',
        entityId: id,
        changes: { name: product.name },
      });
      await queryRunner.manager.save(auditLog);

      // Eliminar relaciones M2M manualmente (JoinTable no tiene cascade)
      await queryRunner.query(
        `DELETE FROM product_participating_organizations WHERE product_id = $1`,
        [id],
      );
      await queryRunner.query(
        `DELETE FROM product_custom_org_links WHERE product_id = $1`,
        [id],
      );
      await queryRunner.query(
        `DELETE FROM product_custom_values WHERE product_id = $1`,
        [id],
      );

      await queryRunner.manager.remove(product);
      await queryRunner.commitTransaction();

      return { deleted: true, id };

    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // CUSTOM FIELD VALIDATION
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Valida el DTO completo antes de crear el producto.
   * Incluye validación de custom fields, organizaciones y referencias a catálogos.
   */
  async validateProductDto(dto: CreateProductDto): Promise<void> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    
    // 1. Obtener definiciones de campos
    const defRepo = dataSource.getRepository(ProductFieldDefinition);
    const definitions = await defRepo.find();

    // 2. Validar custom fields (EAV)
    if (dto.customValues) {
      await this.validateCustomValueDtos(dto.customValues, definitions, dataSource);
    }

    // 3. Validar organizaciones participantes existen
    if (dto.participatingOrganizationIds?.length) {
      const orgRepo = dataSource.getRepository(WorkspaceOrganization);
      const orgs = await orgRepo.findBy({ id: In(dto.participatingOrganizationIds) });
      
      if (orgs.length !== dto.participatingOrganizationIds.length) {
        const foundIds = orgs.map(o => o.id);
        const missingIds = dto.participatingOrganizationIds.filter(id => !foundIds.includes(id));
        throw new BadRequestException(
          `Las siguientes organizaciones no existen: ${missingIds.join(', ')}`
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // CUSTOM VALUES — EAV Save, Sync & Transform
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Valida payload de customValues contra definiciones y FKs de catálogo.
   */
  private async validateCustomValueDtos(
    values: CustomFieldValueDto[],
    definitions: ProductFieldDefinition[],
    dataSource: DataSource,
  ): Promise<void> {
    if (!values.length) return;

    const defById = new Map(definitions.map((d) => [d.id, d]));
    const seen = new Set<string>();
    const catalogItemRepo = dataSource.getRepository(CatalogItem);

    for (const row of values) {
      if (seen.has(row.fieldId)) {
        throw new BadRequestException(
          `El campo custom '${row.fieldId}' está repetido en el payload.`,
        );
      }
      seen.add(row.fieldId);

      const def = defById.get(row.fieldId);
      if (!def) {
        throw new BadRequestException(
          `El fieldId '${row.fieldId}' no existe en product_field_definitions.`,
        );
      }

      const scalarCandidate = row.valueText ?? row.valueCatalogId ?? null;
      if (scalarCandidate === null || scalarCandidate === '') {
        throw new BadRequestException(
          `El campo '${def.label}' requiere un valor (valueText o valueCatalogId).`,
        );
      }

      if (def.type === 'CATALOG_REF') {
        const catalogId = row.valueCatalogId ?? row.valueText;
        if (!catalogId || typeof catalogId !== 'string') {
          throw new BadRequestException(
            `El campo '${def.label}' requiere valueCatalogId para referencias de catálogo.`,
          );
        }

        const catalogItem = await catalogItemRepo.findOne({
          where: { id: catalogId },
          relations: ['catalog'],
        });

        if (!catalogItem) {
          throw new BadRequestException(
            `El valor seleccionado para '${def.label}' no existe en el catálogo.`,
          );
        }

        if (
          def.linkedCatalogId &&
          catalogItem.catalog.id !== def.linkedCatalogId
        ) {
          throw new BadRequestException(
            `El valor de '${def.label}' pertenece a un catálogo diferente.`,
          );
        }

        continue;
      }

      const value = String(scalarCandidate);
      switch (def.type) {
        case 'NUMBER':
          if (Number.isNaN(Number(value))) {
            throw new BadRequestException(
              `El campo '${def.label}' debe ser numérico.`,
            );
          }
          break;
        case 'BOOLEAN': {
          const normalized = value.trim().toLowerCase();
          if (normalized !== 'true' && normalized !== 'false') {
            throw new BadRequestException(
              `El campo '${def.label}' debe ser true o false.`,
            );
          }
          break;
        }
        case 'DATE':
          if (Number.isNaN(Date.parse(value))) {
            throw new BadRequestException(
              `El campo '${def.label}' debe ser una fecha válida.`,
            );
          }
          break;
        default:
          break;
      }
    }
  }

  /**
   * Guarda un arreglo de CustomFieldValueDto como ProductCustomValue rows.
   * Inspecciona el tipo de la definición del campo para decidir en qué
   * columna almacenar el valor (value_text o value_catalog_id).
   */
  private async saveCustomValues(
    queryRunner: QueryRunner,
    productId: string,
    values: CustomFieldValueDto[],
  ): Promise<void> {
    if (!values.length) return;
    await this.upsertCustomValues(queryRunner, productId, values);
  }

  /**
   * Upsert parcial: inserta o actualiza SOLO los fieldIds enviados.
   * No elimina valores existentes que no estén en el payload.
   */
  private async upsertCustomValues(
    queryRunner: QueryRunner,
    productId: string,
    incomingValues: CustomFieldValueDto[],
  ): Promise<void> {
    if (!incomingValues.length) return;

    // Dedup by fieldId (last wins)
    const byField = new Map<string, CustomFieldValueDto>();
    for (const v of incomingValues) byField.set(v.fieldId, v);
    const deduped = [...byField.values()];
    const fieldIds = deduped.map((v) => v.fieldId);

    const definitions = await queryRunner.manager
      .getRepository(ProductFieldDefinition)
      .findBy({ id: In(fieldIds) });
    const defMap = new Map(definitions.map((d) => [d.id, d]));

    const existingRows = await queryRunner.manager.find(ProductCustomValue, {
      where: { productId, fieldId: In(fieldIds) },
    });
    const existingByFieldId = new Map(existingRows.map((r) => [r.fieldId, r]));

    const toSave: ProductCustomValue[] = [];

    for (const dto of deduped) {
      const def = defMap.get(dto.fieldId);
      if (!def) continue;

      const isCatalogRef = def.type === 'CATALOG_REF';
      const valueCatalogId = isCatalogRef
        ? (dto.valueCatalogId ?? dto.valueText ?? null)
        : null;
      const valueText = isCatalogRef
        ? null
        : (dto.valueText ?? dto.valueCatalogId ?? null);

      const existing = existingByFieldId.get(dto.fieldId);
      if (existing) {
        existing.valueCatalogId = valueCatalogId;
        existing.valueText = valueText === null ? null : String(valueText);
        toSave.push(existing);
      } else {
        const row = new ProductCustomValue();
        row.productId = productId;
        row.fieldId = dto.fieldId;
        row.valueCatalogId = valueCatalogId;
        row.valueText = valueText === null ? null : String(valueText);
        toSave.push(row);
      }
    }

    if (toSave.length) {
      await queryRunner.manager.save(ProductCustomValue, toSave);
    }
  }

  /**
   * Sincroniza los custom values existentes con el payload entrante.
   * Estrategia diff:
   *   - Si el campo existe → UPDATE su valor
   *   - Si el campo es nuevo → INSERT
   *   - Si un campo existente no viene en el payload → DELETE
   */
  private async syncCustomValues(
    queryRunner: QueryRunner,
    productId: string,
    incomingValues: CustomFieldValueDto[],
  ): Promise<void> {
    // 1. Cargar existentes del producto
    const existingRows = await queryRunner.manager.find(ProductCustomValue, {
      where: { productId },
    });

    // 2. DELETE: campos existentes que no están en el payload entrante
    const incomingFieldIds = new Set(incomingValues.map((v) => v.fieldId));
    const toDelete = existingRows.filter((r) => !incomingFieldIds.has(r.fieldId));
    if (toDelete.length) {
      await queryRunner.manager.remove(ProductCustomValue, toDelete);
    }

    // 3. INSERT/UPDATE de los campos presentes en payload
    await this.upsertCustomValues(queryRunner, productId, incomingValues);
  }

  /**
   * Transforma un arreglo de ProductCustomValue rows (con fieldDefinition y
   * catalogItem cargados) a un objeto key-value compatible con el formato
   * attributes que el frontend espera.
   *
   * Ejemplo de salida:
   * {
   *   "work_package": "uuid-catalog-item-id",
   *   "next_steps": "Complete baseline study",
   *   "budget": "50000",
   *   "is_active": "true"
   * }
   */
  private transformCustomValuesToMap(
    customValues: ProductCustomValue[] | undefined,
  ): Record<string, any> {
    if (!customValues?.length) return {};

    const result: Record<string, any> = {};

    for (const cv of customValues) {
      const key = cv.fieldDefinition?.key;
      if (!key) continue;

      if (cv.valueCatalogId) {
        // CATALOG_REF: devolver el UUID
        result[key] = cv.valueCatalogId;
      } else if (cv.valueText !== null && cv.valueText !== undefined) {
        const fieldType = cv.fieldDefinition?.type;
        if (fieldType === 'NUMBER') {
          const num = Number(cv.valueText);
          result[key] = Number.isNaN(num) ? cv.valueText : num;
        } else if (fieldType === 'BOOLEAN') {
          const normalized = cv.valueText.trim().toLowerCase();
          if (normalized === 'true') result[key] = true;
          else if (normalized === 'false') result[key] = false;
          else result[key] = cv.valueText;
        } else {
          result[key] = cv.valueText;
        }
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // CUSTOM M:N LINKS — Sync & Load
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Sincroniza las tablas pivote dinámicas para un producto.
   * Estrategia: DELETE completo + INSERT (evita diffing complejo).
   * Solo borra/recrea los fields que fueron enviados en el payload.
   */
  private async syncCustomLinks(
    queryRunner: QueryRunner,
    productId: string,
    customOrgFields?: CustomOrgFieldDto[],
  ): Promise<void> {
    // ── ORG_MULTI ─────────────────────────────────────────────────────
    if (customOrgFields) {
      for (const field of customOrgFields) {
        // DELETE todos los links de este product + field
        await queryRunner.query(
          `DELETE FROM product_custom_org_links
           WHERE product_id = $1 AND field_definition_id = $2`,
          [productId, field.fieldId],
        );

        // INSERT nuevos links
        if (field.orgIds?.length) {
          const values = field.orgIds.map((orgId) =>
            queryRunner.manager.create(ProductCustomOrgLink, {
              productId,
              fieldDefinitionId: field.fieldId,
              organizationId: orgId,
            }),
          );
          await queryRunner.manager.save(ProductCustomOrgLink, values);
        }
      }
    }
  }

  /**
   * Carga los campos custom M:N de un producto y los transforma
   * en un objeto amigable usando el `key` del field definition.
   *
   * Ejemplo de salida:
   * {
   *   distributor_organizations: [{ id: "...", name: "ONG Verde" }],
   *   priority_themes: [{ id: "...", name: "Biodiversidad", code: "BIO" }]
   * }
   */
  private async loadCustomLinks(
    dataSource: DataSource,
    productId: string,
  ): Promise<Record<string, any[]>> {
    const result: Record<string, any[]> = {};

    // ── ORG_MULTI: cargar con JOINs ──────────────────────────────────
    const orgLinks: Array<{
      field_key: string;
      organization_id: string;
      org_name: string;
      org_tax_id: string;
    }> = await dataSource.query(
      `SELECT pfd.key AS field_key,
              pcol.organization_id,
              wo.name AS org_name,
              wo.tax_id AS org_tax_id
       FROM product_custom_org_links pcol
       JOIN product_field_definitions pfd ON pcol.field_definition_id = pfd.id
       JOIN workspace_organizations wo ON pcol.organization_id = wo.id
       WHERE pcol.product_id = $1
       ORDER BY pfd."order", wo.name`,
      [productId],
    );

    for (const row of orgLinks) {
      if (!result[row.field_key]) result[row.field_key] = [];
      result[row.field_key].push({
        id: row.organization_id,
        name: row.org_name,
        taxId: row.org_tax_id,
      });
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PRODUCT MATRIX
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Construye la matrix bidimensional [Grupo × Indicadores].
   * El eje Y es dinámico según `dto.groupBy`.
   */
  async buildMatrix(dto: MatrixQueryDto): Promise<MatrixResponseDto> {
    const dataSource = await this.tenantConnection.getTenantConnection();

    // 1. Cargar field definitions para resolver estrategias de atributos
    const defRepo = dataSource.getRepository(ProductFieldDefinition);
    const definitions = await defRepo.find();
    const defMap = new Map(
      definitions.map((d) => [
        d.key,
        { id: d.id, label: d.label, type: d.type, linkedCatalogId: d.linkedCatalogId },
      ]),
    );

    // 2. Resolver estrategia de agrupamiento
    const strategy = resolveGroupByStrategy(dto.groupBy, defMap);
    if (!strategy) {
      throw new BadRequestException(
        `groupBy '${dto.groupBy}' no es un campo válido para este tenant.`,
      );
    }

    // 3. Construir cláusulas WHERE dinámicas
    const whereFragments: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (dto.outputId) {
      whereFragments.push(`so.id = $${paramIdx++}`);
      params.push(dto.outputId);
    }
    if (dto.organizationId) {
      whereFragments.push(`p.owner_organization_id = $${paramIdx++}`);
      params.push(dto.organizationId);
    }
    if (dto.countryId) {
      whereFragments.push(`p.country_id = $${paramIdx++}`);
      params.push(dto.countryId);
    }
    if (dto.search) {
      whereFragments.push(`p.name ILIKE $${paramIdx++}`);
      params.push(`%${dto.search}%`);
    }

    // Filtros de catálogo (campos custom CATALOG_REF)
    if (dto.catalogFilters) {
      try {
        const filters: Record<string, string[]> = JSON.parse(dto.catalogFilters);
        Logger.log(`[Matrix] catalogFilters parsed: ${JSON.stringify(filters)}`, 'ProductsService');
        for (const [fieldKey, itemIds] of Object.entries(filters)) {
          if (!Array.isArray(itemIds) || itemIds.length === 0) continue;
          if (!/^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(fieldKey)) {
            Logger.warn(`[Matrix] key rejected by regex: "${fieldKey}"`, 'ProductsService');
            continue;
          }
          const def = defMap.get(fieldKey);
          if (!def) {
            Logger.warn(`[Matrix] key not found in defMap: "${fieldKey}"`, 'ProductsService');
            continue;
          }
          if (def.type !== 'CATALOG_REF') {
            Logger.warn(`[Matrix] key "${fieldKey}" has type "${def.type}", skipping`, 'ProductsService');
            continue;
          }
          const defIdPlaceholder = `$${paramIdx++}`;
          const placeholders = itemIds.map(() => `$${paramIdx++}`).join(', ');
          whereFragments.push(
            `EXISTS (SELECT 1 FROM product_custom_values pcv
                     WHERE pcv.product_id = p.id
                       AND pcv.field_id = ${defIdPlaceholder}
                       AND pcv.value_catalog_id IN (${placeholders}))`,
          );
          params.push(def.id, ...itemIds);
          Logger.log(`[Matrix] filter applied for "${fieldKey}" (${def.type}), itemIds: ${JSON.stringify(itemIds)}`, 'ProductsService');
        }
      } catch (e) {
        Logger.error(`[Matrix] catalogFilters parse/process error: ${e}`, 'ProductsService');
      }
    }

    Logger.log(`[Matrix] final WHERE: ${whereFragments.length > 0 ? whereFragments.join(' AND ') : '(none)'}`, 'ProductsService');
    Logger.log(`[Matrix] params: ${JSON.stringify(params)}`, 'ProductsService');

    const whereClause =
      whereFragments.length > 0 ? 'WHERE ' + whereFragments.join(' AND ') : '';

    // ── Q1: Indicadores (filtrados opcionalmente por output) ──────────
    const indicatorWhereFragments: string[] = [];
    const indicatorParams: any[] = [];
    let indParamIdx = 1;

    if (dto.outputId) {
      indicatorWhereFragments.push(`so.id = $${indParamIdx++}`);
      indicatorParams.push(dto.outputId);
    }

    const indicatorWhere =
      indicatorWhereFragments.length > 0
        ? 'WHERE ' + indicatorWhereFragments.join(' AND ')
        : '';

    const indicatorsRaw: Array<{
      id: string;
      code: string;
      description: string;
      unit: string | null;
      total_target: number | null;
      output_id: string;
      output_code: string;
      output_name: string;
    }> = await dataSource.query(
      `SELECT si.id, si.code, si.description, si.unit, si.total_target,
              si.output_id,
              so.code AS output_code, so.name AS output_name
       FROM strategic_indicators si
       JOIN strategic_outputs so ON si.output_id = so.id
       ${indicatorWhere}
       ORDER BY so."order", si.code`,
      indicatorParams,
    );

    if (indicatorsRaw.length === 0) {
      return {
        groupByField: {
          value: dto.groupBy,
          label: strategy.label,
          available: true,
        },
        indicators: [],
        matrix: [],
        totalProducts: 0,
      };
    }

    // ── Q2: Traer TODOS los productos, con o sin indicador ───────────
    const productQuery = `
      SELECT p.id, p.name, p.delivery_date, p.deliverable,
             ${strategy.selectGroup},
             ps.indicator_id,
             ps.committed_target,
             si.unit AS indicator_unit,
             wo_ctx.name AS owner_org_name,
             c_prod.name AS country_name
      FROM products p
      ${strategy.joinClause}
      LEFT JOIN product_strategies ps ON ps.product_id = p.id
      LEFT JOIN strategic_indicators si ON ps.indicator_id = si.id
      LEFT JOIN strategic_outputs so ON si.output_id = so.id
      LEFT JOIN workspace_organizations wo_ctx ON p.owner_organization_id = wo_ctx.id
      LEFT JOIN countries c_prod ON p.country_id = c_prod.id
      ${whereClause}
      ORDER BY p.name
    `;

    const productsRaw: Array<{
      id: string;
      name: string;
      delivery_date: string | null;
      deliverable: string | null;
      group_id: string;
      group_name: string;
      indicator_id: string | null;
      committed_target: number | null;
      indicator_unit: string | null;
      owner_org_name: string | null;
      country_name: string | null;
    }> = await dataSource.query(productQuery, params);

    Logger.log(`[Matrix] Q2 returned ${productsRaw.length} product rows (with WHERE: ${whereFragments.length > 0})`, 'ProductsService');

    // ── Ensamble en memoria ───────────────────────────────────────────

    // 1. Incluir todos los indicadores + columna especial "Sin indicador"
    const indicatorIdsWithProducts = new Set(
      productsRaw.filter((p) => p.indicator_id).map((p) => p.indicator_id),
    );
    let indicators: MatrixIndicatorDto[] = indicatorsRaw
      .filter((ind) => indicatorIdsWithProducts.has(ind.id))
      .map((ind) => ({
        id: ind.id,
        code: ind.code,
        description: ind.description,
        unit: ind.unit,
        totalTarget: ind.total_target ? Number(ind.total_target) : null,
        outputId: ind.output_id,
        outputCode: ind.output_code,
        outputName: ind.output_name,
      }));

    // Agregar columna especial para productos sin indicador
    const SIN_INDICADOR_ID = '__sin_indicador__';
    indicators = [
      ...indicators,
      {
        id: SIN_INDICADOR_ID,
        code: 'Sin indicador',
        description: 'Productos sin indicador asociado',
        unit: null,
        totalTarget: null,
        outputId: '',
        outputCode: '',
        outputName: '',
      },
    ];

    // Mantener el orden de outputs y ordenar metas por código jerárquico natural.
    const outputOrderRank = new Map<string, number>();
    for (const ind of indicatorsRaw) {
      if (!outputOrderRank.has(ind.output_id)) {
        outputOrderRank.set(ind.output_id, outputOrderRank.size);
      }
    }

    indicators.sort((a, b) => {
      const outputDiff =
        (outputOrderRank.get(a.outputId) ?? Number.MAX_SAFE_INTEGER) -
        (outputOrderRank.get(b.outputId) ?? Number.MAX_SAFE_INTEGER);
      if (outputDiff !== 0) return outputDiff;
      return compareHierarchicalCode(a.code, b.code);
    });

    // Grupos únicos (preservar orden de aparición) + conteo de productos por grupo
    const groupMap = new Map<string, MatrixGroupDto>();
    const groupProductIds = new Map<string, Set<string>>();
    for (const p of productsRaw) {
      if (!groupMap.has(p.group_id)) {
        groupMap.set(p.group_id, { id: p.group_id, name: p.group_name, productCount: 0 });
        groupProductIds.set(p.group_id, new Set());
      }
      groupProductIds.get(p.group_id)!.add(p.id);
    }
    for (const [gid, group] of groupMap) {
      group.productCount = groupProductIds.get(gid)!.size;
    }
    const groups = Array.from(groupMap.values());

    // Construir filas: [group, ...cells]
    const matrix: Array<[MatrixGroupDto, ...MatrixCellDto[]]> = groups.map(
      (group) => {
        const cells: MatrixCellDto[] = indicators.map((ind) => {
          let cellProducts: MatrixProductDto[];
          if (ind.id === SIN_INDICADOR_ID) {
            // Productos sin indicador
            cellProducts = productsRaw
              .filter((p) => p.group_id === group.id && !p.indicator_id)
              .map(
                (p): MatrixProductDto => ({
                  id: p.id,
                  name: p.name,
                  deliveryDate: p.delivery_date,
                  ownerOrgName: p.owner_org_name,
                  countryName: p.country_name,
                  deliverable: p.deliverable,
                  committedTarget: null,
                  unit: null,
                }),
              );
          } else {
            // Productos con ese indicador
            cellProducts = productsRaw
              .filter(
                (p) => p.group_id === group.id && p.indicator_id === ind.id,
              )
              .map(
                (p): MatrixProductDto => ({
                  id: p.id,
                  name: p.name,
                  deliveryDate: p.delivery_date,
                  ownerOrgName: p.owner_org_name,
                  countryName: p.country_name,
                  deliverable: p.deliverable,
                  committedTarget: p.committed_target
                    ? Number(p.committed_target)
                    : null,
                  unit: p.indicator_unit,
                }),
              );
          }

          return {
            indicator: ind,
            group,
            products: cellProducts,
          };
        });

        return [group, ...cells] as [MatrixGroupDto, ...MatrixCellDto[]];
      },
    );

    // Conteo de productos únicos (todos)
    const totalProducts = new Set(productsRaw.map((p) => p.id)).size;

    return {
      groupByField: {
        value: dto.groupBy,
        label: strategy.label,
        available: true,
      },
      indicators,
      matrix,
      totalProducts,
    };
  }

  /**
   * Devuelve las opciones disponibles para el dropdown "Group by".
   * Incluye campos base + campos custom (ProductFieldDefinition).
   */
  async getGroupByOptions(): Promise<GroupByOptionDto[]> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const options: GroupByOptionDto[] = [];

    // ── Campos base ───────────────────────────────────────────────────
    const baseKeys = getBaseStrategyKeys();
    for (const key of baseKeys) {
      let available = true;

      // country: la tabla countries siempre existe (sembrada en onboarding)
      // Solo verificamos que tenga al menos un registro
      if (key === 'country') {
        const countResult = await dataSource.query(
          `SELECT EXISTS (SELECT 1 FROM countries LIMIT 1) as has_countries`
        );
        available = countResult[0]?.has_countries ?? false;
      }

      options.push({
        value: key,
        label: getBaseStrategyLabel(key)!,
        available,
        type: 'base',
      });
    }

    return options;
  }

  /**
   * Devuelve las opciones de filtro por catálogo.
   * Campos custom de tipo CATALOG_REF con sus ítems.
   */
  async getCatalogFilterOptions(): Promise<CatalogFilterOptionDto[]> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const defRepo = dataSource.getRepository(ProductFieldDefinition);
    const definitions = await defRepo.find({
      where: { type: 'CATALOG_REF' },
      order: { order: 'ASC' },
    });

    Logger.log(`[Matrix] getCatalogFilterOptions: found ${definitions.length} definitions: ${definitions.map(d => `${d.key}(${d.type})`).join(', ')}`, 'ProductsService');

    const result: CatalogFilterOptionDto[] = [];

    for (const def of definitions) {
      if (!def.linkedCatalogId) continue;

      const items: Array<{ id: string; name: string; code: string | null }> =
        await dataSource.query(
          `SELECT ci.id, ci.name, ci.code
           FROM catalog_items ci
           WHERE ci.catalog_id = $1
           ORDER BY ci.display_order, ci.name`,
          [def.linkedCatalogId],
        );

      result.push({
        key: def.key,
        label: def.label,
        catalogCode: def.linkedCatalogCode,
        type: def.type as 'CATALOG_REF',
        items: items.map((i) => ({ id: i.id, name: i.name, code: i.code })),
      });
    }

    return result;
  }

  /**
   * Devuelve los outputs estratégicos disponibles para el filtro de la matrix.
   */
  async getMatrixOutputOptions(): Promise<MatrixOutputOptionDto[]> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const outputs: Array<{ id: string; code: string; name: string }> =
      await dataSource.query(
        `SELECT id, code, name FROM strategic_outputs ORDER BY "order", code`,
      );
    return outputs;
  }
}