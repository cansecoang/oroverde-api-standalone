import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FieldDefinitionsService } from './field-definitions.service';

// ── Mock Factories ────────────────────────────────────────────────────────────

function makeRepo(overrides: Record<string, any> = {}) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxOrder: -1 }),
  };
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => ({ id: 'new-id', ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    __qb: qb,
    ...overrides,
  };
}

function makeDataSource(repos: Record<string, any> = {}) {
  const defaultRepo = makeRepo();
  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : entity;
      return repos[name] || defaultRepo;
    }),
    __defaultRepo: defaultRepo,
  };
}

function makeTenantConn(ds: ReturnType<typeof makeDataSource>) {
  return { getTenantConnection: jest.fn().mockResolvedValue(ds) };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CATALOG = { id: 'cat-1', code: 'SOIL_TYPE', name: 'Soil Type' };

const FIELD_TEXT = {
  id: 'fd-1',
  key: 'project_budget',
  label: 'Presupuesto',
  type: 'TEXT',
  linkedCatalogCode: null,
  linkedCatalogId: null,
  required: false,
  order: 0,
};

const FIELD_CATALOG = {
  id: 'fd-2',
  key: 'soil_type',
  label: 'Tipo de Suelo',
  type: 'CATALOG_REF',
  linkedCatalogCode: 'SOIL_TYPE',
  linkedCatalogId: 'cat-1',
  required: false,
  order: 1,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('FieldDefinitionsService', () => {
  let service: FieldDefinitionsService;
  let ds: ReturnType<typeof makeDataSource>;
  let fieldRepo: ReturnType<typeof makeRepo>;
  let catalogRepo: ReturnType<typeof makeRepo>;
  let tenantConn: ReturnType<typeof makeTenantConn>;

  beforeEach(() => {
    fieldRepo = makeRepo();
    catalogRepo = makeRepo();

    ds = makeDataSource({
      ProductFieldDefinition: fieldRepo,
      Catalog: catalogRepo,
    });
    tenantConn = makeTenantConn(ds);
    service = new FieldDefinitionsService(tenantConn as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // createDefinition
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createDefinition', () => {
    it('should create a TEXT field with auto-assigned order 0 when no fields exist', async () => {
      fieldRepo.__qb.getRawOne.mockResolvedValue({ maxOrder: -1 });
      fieldRepo.findOne.mockResolvedValue(null); // no duplicate key

      const result = await service.createDefinition({
        key: 'project_budget',
        label: 'Presupuesto',
        type: 'TEXT',
      });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'project_budget', order: 0 }),
      );
      expect(result).toMatchObject({ key: 'project_budget', order: 0 });
    });

    it('should auto-assign next order based on current max', async () => {
      fieldRepo.__qb.getRawOne.mockResolvedValue({ maxOrder: 3 });
      fieldRepo.findOne.mockResolvedValue(null);

      await service.createDefinition({ key: 'new_field', label: 'New', type: 'TEXT' });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ order: 4 }),
      );
    });

    it('should respect explicit order when provided', async () => {
      fieldRepo.findOne.mockResolvedValue(null);

      await service.createDefinition({ key: 'field_a', label: 'A', type: 'TEXT', order: 7 });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ order: 7 }),
      );
      // QueryBuilder for max order should NOT be called
      expect(fieldRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for duplicate key', async () => {
      fieldRepo.findOne.mockResolvedValue(FIELD_TEXT); // key already exists

      await expect(
        service.createDefinition({ key: 'project_budget', label: 'X', type: 'TEXT' }),
      ).rejects.toThrow("Ya existe un campo con la clave 'project_budget'");
    });

    it('should create CATALOG_REF field using linkedCatalogId (preferred path)', async () => {
      catalogRepo.findOne.mockResolvedValue(CATALOG); // catalog found by ID
      fieldRepo.findOne.mockResolvedValue(null);       // no duplicate key

      await service.createDefinition({
        key: 'soil_type',
        label: 'Tipo de Suelo',
        type: 'CATALOG_REF',
        linkedCatalogId: 'cat-1',
      });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedCatalogId: 'cat-1',
          linkedCatalogCode: 'SOIL_TYPE', // auto-populated from catalog
        }),
      );
    });

    it('should create CATALOG_REF field using linkedCatalogCode (legacy path)', async () => {
      catalogRepo.findOne.mockResolvedValue(CATALOG); // catalog found by code
      fieldRepo.findOne.mockResolvedValue(null);

      await service.createDefinition({
        key: 'soil_type',
        label: 'Tipo de Suelo',
        type: 'CATALOG_REF',
        linkedCatalogCode: 'SOIL_TYPE',
      });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedCatalogId: 'cat-1', // resolved from code
          linkedCatalogCode: 'SOIL_TYPE',
        }),
      );
    });

    it('should throw BadRequestException for CATALOG_REF when catalogId does not exist', async () => {
      catalogRepo.findOne.mockResolvedValue(null); // catalog not found

      await expect(
        service.createDefinition({
          key: 'soil_type',
          label: 'Tipo de Suelo',
          type: 'CATALOG_REF',
          linkedCatalogId: 'nonexistent',
        }),
      ).rejects.toThrow("El catálogo con id 'nonexistent' no existe");
    });

    it('should throw BadRequestException for CATALOG_REF when catalogCode does not exist', async () => {
      catalogRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createDefinition({
          key: 'soil_type',
          label: 'Tipo de Suelo',
          type: 'CATALOG_REF',
          linkedCatalogCode: 'NONEXISTENT',
        }),
      ).rejects.toThrow("El catálogo 'NONEXISTENT' no existe");
    });

    it('should throw BadRequestException for CATALOG_REF when neither id nor code provided', async () => {
      await expect(
        service.createDefinition({ key: 'soil_type', label: 'Suelo', type: 'CATALOG_REF' }),
      ).rejects.toThrow('Falta linkedCatalogId o linkedCatalogCode');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProjectTemplate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProjectTemplate', () => {
    it('should return all fields ordered by order ASC', async () => {
      fieldRepo.find.mockResolvedValue([FIELD_TEXT, FIELD_CATALOG]);

      const result = await service.getProjectTemplate();

      expect(result).toHaveLength(2);
      expect(fieldRepo.find).toHaveBeenCalledWith({ order: { order: 'ASC' } });
    });

    it('should return empty array when no fields defined', async () => {
      fieldRepo.find.mockResolvedValue([]);

      const result = await service.getProjectTemplate();
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateDefinition
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateDefinition', () => {
    it('should update label on a TEXT field', async () => {
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_TEXT });

      const result = await service.updateDefinition('fd-1', { label: 'Nuevo Label' });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Nuevo Label' }),
      );
      expect(result).toMatchObject({ label: 'Nuevo Label' });
    });

    it('should throw NotFoundException if field does not exist', async () => {
      fieldRepo.findOne.mockResolvedValue(null);

      await expect(service.updateDefinition('nonexistent', { label: 'X' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should update linkedCatalogId for CATALOG_REF field (preferred path)', async () => {
      catalogRepo.findOne.mockResolvedValue({ id: 'cat-2', code: 'REGION' });
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_CATALOG });

      await service.updateDefinition('fd-2', { linkedCatalogId: 'cat-2' });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedCatalogId: 'cat-2',
          linkedCatalogCode: 'REGION',
        }),
      );
    });

    it('should update linkedCatalogCode for CATALOG_REF field (legacy path)', async () => {
      catalogRepo.findOne.mockResolvedValue({ id: 'cat-2', code: 'REGION' });
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_CATALOG });

      await service.updateDefinition('fd-2', { linkedCatalogCode: 'REGION' });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ linkedCatalogId: 'cat-2' }),
      );
    });

    it('should throw BadRequestException when linkedCatalogId does not exist', async () => {
      catalogRepo.findOne.mockResolvedValue(null);
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_CATALOG });

      await expect(
        service.updateDefinition('fd-2', { linkedCatalogId: 'bad-cat' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update order without touching catalog for non-CATALOG_REF field', async () => {
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_TEXT });

      await service.updateDefinition('fd-1', { order: 5 });

      expect(fieldRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ order: 5 }),
      );
      // Catalog repo should not be queried for TEXT fields
      expect(catalogRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // removeDefinition
  // ═══════════════════════════════════════════════════════════════════════════

  describe('removeDefinition', () => {
    it('should remove an existing field and return { deleted: true }', async () => {
      fieldRepo.findOne.mockResolvedValue({ ...FIELD_TEXT });

      const result = await service.removeDefinition('fd-1');

      expect(result).toEqual({ deleted: true });
      expect(fieldRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fd-1' }),
      );
    });

    it('should throw NotFoundException when field does not exist', async () => {
      fieldRepo.findOne.mockResolvedValue(null);

      await expect(service.removeDefinition('nonexistent'))
        .rejects.toThrow(NotFoundException);
      expect(fieldRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // reorderDefinitions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reorderDefinitions', () => {
    it('should update order index for each id in sequence', async () => {
      const fields = [{ ...FIELD_TEXT }, { ...FIELD_CATALOG }];
      fieldRepo.find.mockResolvedValueOnce(fields) // find by In(ids) — validation
               .mockResolvedValueOnce(fields);      // find after update — result

      await service.reorderDefinitions(['fd-1', 'fd-2']);

      // Should be called for each position
      expect(fieldRepo.update).toHaveBeenCalledWith('fd-1', { order: 0 });
      expect(fieldRepo.update).toHaveBeenCalledWith('fd-2', { order: 1 });
    });

    it('should throw BadRequestException when some IDs do not exist', async () => {
      // Only 1 field found, but 2 IDs provided
      fieldRepo.find.mockResolvedValue([FIELD_TEXT]);

      await expect(service.reorderDefinitions(['fd-1', 'nonexistent']))
        .rejects.toThrow('Algunos IDs de campo no existen');
      expect(fieldRepo.update).not.toHaveBeenCalled();
    });

    it('should return fields in new order after reordering', async () => {
      const reorderedFields = [{ ...FIELD_CATALOG, order: 0 }, { ...FIELD_TEXT, order: 1 }];
      fieldRepo.find
        .mockResolvedValueOnce([FIELD_TEXT, FIELD_CATALOG]) // validation
        .mockResolvedValueOnce(reorderedFields);              // result

      const result = await service.reorderDefinitions(['fd-2', 'fd-1']);

      expect(result).toHaveLength(2);
      expect(fieldRepo.find).toHaveBeenLastCalledWith({ order: { order: 'ASC' } });
    });
  });
});
