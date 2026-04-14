/**
 * products.service.eav.spec.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Unit tests for the EAV (Entity-Attribute-Value) private methods in
 * ProductsService:
 *   - validateCustomValueDtos   (validation rules per field type)
 *   - transformCustomValuesToMap (EAV rows → frontend attributes object)
 *   - syncCustomValues           (diff strategy: delete missing, upsert present)
 *   - upsertCustomValues         (insert new + update existing rows)
 *
 * Private methods are exercised directly via `(service as any).method()`.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

// ── Mock Factories ────────────────────────────────────────────────────────────

function makeQueryRunner(overrides: Record<string, any> = {}) {
  const qr: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    manager: {
      create: jest.fn().mockImplementation((_e, d) => ({ ...d })),
      save: jest.fn().mockImplementation((entityOrData, data) =>
        Promise.resolve(data ?? entityOrData),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn().mockReturnValue({
        findBy: jest.fn().mockResolvedValue([]),
        find: jest.fn().mockResolvedValue([]),
      }),
    },
    ...overrides,
  };
  return qr;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeDataSource(repos: Record<string, any> = {}) {
  const qr = makeQueryRunner();
  const defaultRepo = makeRepo();
  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : entity;
      return repos[name] || defaultRepo;
    }),
    createQueryRunner: jest.fn().mockReturnValue(qr),
    query: jest.fn().mockResolvedValue([]),
    __qr: qr,
  };
}

function makeTenantConn(ds: ReturnType<typeof makeDataSource>) {
  return { getTenantConnection: jest.fn().mockResolvedValue(ds) };
}

// ── Field Definition Fixtures ─────────────────────────────────────────────────

function makeFieldDef(overrides: Partial<{
  id: string; key: string; label: string; type: string;
  linkedCatalogId: string | null; linkedCatalogCode: string | null;
}> = {}) {
  return {
    id: 'fd-text',
    key: 'project_name',
    label: 'Project Name',
    type: 'TEXT',
    linkedCatalogId: null,
    linkedCatalogCode: null,
    ...overrides,
  };
}

const DEF_TEXT      = makeFieldDef({ id: 'fd-text', key: 'name', label: 'Name', type: 'TEXT' });
const DEF_NUMBER    = makeFieldDef({ id: 'fd-num', key: 'budget', label: 'Budget', type: 'NUMBER' });
const DEF_BOOLEAN   = makeFieldDef({ id: 'fd-bool', key: 'active', label: 'Active', type: 'BOOLEAN' });
const DEF_DATE      = makeFieldDef({ id: 'fd-date', key: 'start_date', label: 'Start Date', type: 'DATE' });
const DEF_CATALOG   = makeFieldDef({
  id: 'fd-cat', key: 'soil_type', label: 'Soil Type', type: 'CATALOG_REF',
  linkedCatalogId: 'cat-1', linkedCatalogCode: 'SOIL_TYPE',
});

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ProductsService — EAV methods', () => {
  let service: ProductsService;
  let ds: ReturnType<typeof makeDataSource>;
  let tenantConn: ReturnType<typeof makeTenantConn>;

  beforeEach(() => {
    ds = makeDataSource();
    tenantConn = makeTenantConn(ds);
    service = new ProductsService(tenantConn as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // validateCustomValueDtos
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validateCustomValueDtos', () => {
    async function validate(
      values: any[],
      definitions: any[],
      catalogItemRepo: any = makeRepo(),
    ) {
      const localDs = makeDataSource({ CatalogItem: catalogItemRepo });
      return (service as any).validateCustomValueDtos(values, definitions, localDs);
    }

    it('should pass for empty values array without touching repos', async () => {
      await expect(validate([], [DEF_TEXT])).resolves.toBeUndefined();
    });

    it('should pass for a valid TEXT value', async () => {
      await expect(
        validate([{ fieldId: 'fd-text', valueText: 'Hello' }], [DEF_TEXT]),
      ).resolves.toBeUndefined();
    });

    it('should pass for a valid NUMBER value', async () => {
      await expect(
        validate([{ fieldId: 'fd-num', valueText: '42' }], [DEF_NUMBER]),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException for invalid NUMBER value', async () => {
      await expect(
        validate([{ fieldId: 'fd-num', valueText: 'not-a-number' }], [DEF_NUMBER]),
      ).rejects.toThrow('debe ser numérico');
    });

    it('should pass for valid BOOLEAN "true"', async () => {
      await expect(
        validate([{ fieldId: 'fd-bool', valueText: 'true' }], [DEF_BOOLEAN]),
      ).resolves.toBeUndefined();
    });

    it('should pass for valid BOOLEAN "false"', async () => {
      await expect(
        validate([{ fieldId: 'fd-bool', valueText: 'false' }], [DEF_BOOLEAN]),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException for invalid BOOLEAN value', async () => {
      await expect(
        validate([{ fieldId: 'fd-bool', valueText: 'yes' }], [DEF_BOOLEAN]),
      ).rejects.toThrow('debe ser true o false');
    });

    it('should pass for valid DATE value', async () => {
      await expect(
        validate([{ fieldId: 'fd-date', valueText: '2026-06-01' }], [DEF_DATE]),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException for invalid DATE value', async () => {
      await expect(
        validate([{ fieldId: 'fd-date', valueText: 'not-a-date' }], [DEF_DATE]),
      ).rejects.toThrow('debe ser una fecha válida');
    });

    it('should throw BadRequestException for unknown fieldId', async () => {
      await expect(
        validate([{ fieldId: 'unknown-id', valueText: 'x' }], [DEF_TEXT]),
      ).rejects.toThrow("El fieldId 'unknown-id' no existe");
    });

    it('should throw BadRequestException for duplicate fieldId in payload', async () => {
      await expect(
        validate(
          [
            { fieldId: 'fd-text', valueText: 'A' },
            { fieldId: 'fd-text', valueText: 'B' },
          ],
          [DEF_TEXT],
        ),
      ).rejects.toThrow("está repetido en el payload");
    });

    it('should throw BadRequestException when valueText and valueCatalogId are both null', async () => {
      await expect(
        validate([{ fieldId: 'fd-text', valueText: null, valueCatalogId: null }], [DEF_TEXT]),
      ).rejects.toThrow('requiere un valor');
    });

    it('should pass for valid CATALOG_REF with existing catalog item in correct catalog', async () => {
      const catalogItemRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({
          id: 'item-1',
          catalog: { id: 'cat-1', code: 'SOIL_TYPE' },
        }),
      });

      await expect(
        validate(
          [{ fieldId: 'fd-cat', valueCatalogId: 'item-1' }],
          [DEF_CATALOG],
          catalogItemRepo,
        ),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException for CATALOG_REF when catalog item not found', async () => {
      const catalogItemRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });

      await expect(
        validate(
          [{ fieldId: 'fd-cat', valueCatalogId: 'nonexistent-item' }],
          [DEF_CATALOG],
          catalogItemRepo,
        ),
      ).rejects.toThrow('no existe en el catálogo');
    });

    it('should throw BadRequestException when catalog item belongs to wrong catalog', async () => {
      const catalogItemRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({
          id: 'item-1',
          catalog: { id: 'cat-OTHER', code: 'OTHER' }, // different catalog
        }),
      });

      await expect(
        validate(
          [{ fieldId: 'fd-cat', valueCatalogId: 'item-1' }],
          [DEF_CATALOG],
          catalogItemRepo,
        ),
      ).rejects.toThrow('pertenece a un catálogo diferente');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // transformCustomValuesToMap
  // ═══════════════════════════════════════════════════════════════════════════

  describe('transformCustomValuesToMap', () => {
    function transform(customValues: any[]) {
      return (service as any).transformCustomValuesToMap(customValues);
    }

    it('should return empty object for undefined input', () => {
      expect(transform(undefined)).toEqual({});
    });

    it('should return empty object for empty array', () => {
      expect(transform([])).toEqual({});
    });

    it('should map TEXT field to string value', () => {
      const rows = [{
        fieldDefinition: { key: 'project_name', type: 'TEXT' },
        valueText: 'My Project',
        valueCatalogId: null,
      }];
      expect(transform(rows)).toEqual({ project_name: 'My Project' });
    });

    it('should map NUMBER field to parsed number', () => {
      const rows = [{
        fieldDefinition: { key: 'budget', type: 'NUMBER' },
        valueText: '50000',
        valueCatalogId: null,
      }];
      expect(transform(rows)).toEqual({ budget: 50000 });
    });

    it('should map NUMBER field to string when not parseable (graceful fallback)', () => {
      const rows = [{
        fieldDefinition: { key: 'budget', type: 'NUMBER' },
        valueText: 'corrupted',
        valueCatalogId: null,
      }];
      const result = transform(rows);
      expect(result.budget).toBe('corrupted');
    });

    it('should map BOOLEAN "true" to boolean true', () => {
      const rows = [{
        fieldDefinition: { key: 'active', type: 'BOOLEAN' },
        valueText: 'true',
        valueCatalogId: null,
      }];
      expect(transform(rows)).toEqual({ active: true });
    });

    it('should map BOOLEAN "false" to boolean false', () => {
      const rows = [{
        fieldDefinition: { key: 'active', type: 'BOOLEAN' },
        valueText: 'false',
        valueCatalogId: null,
      }];
      expect(transform(rows)).toEqual({ active: false });
    });

    it('should map CATALOG_REF to UUID (valueCatalogId takes priority)', () => {
      const rows = [{
        fieldDefinition: { key: 'soil_type', type: 'CATALOG_REF' },
        valueCatalogId: 'item-uuid-123',
        valueText: null,
      }];
      expect(transform(rows)).toEqual({ soil_type: 'item-uuid-123' });
    });

    it('should skip rows with missing fieldDefinition key', () => {
      const rows = [{
        fieldDefinition: null, // corrupt row
        valueText: 'x',
        valueCatalogId: null,
      }];
      expect(transform(rows)).toEqual({});
    });

    it('should map multiple fields simultaneously', () => {
      const rows = [
        { fieldDefinition: { key: 'name', type: 'TEXT' }, valueText: 'Alpha', valueCatalogId: null },
        { fieldDefinition: { key: 'budget', type: 'NUMBER' }, valueText: '1000', valueCatalogId: null },
        { fieldDefinition: { key: 'active', type: 'BOOLEAN' }, valueText: 'true', valueCatalogId: null },
        { fieldDefinition: { key: 'soil_type', type: 'CATALOG_REF' }, valueCatalogId: 'cat-item-1', valueText: null },
      ];
      expect(transform(rows)).toEqual({
        name: 'Alpha',
        budget: 1000,
        active: true,
        soil_type: 'cat-item-1',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // syncCustomValues
  // ═══════════════════════════════════════════════════════════════════════════

  describe('syncCustomValues', () => {
    it('should delete rows not present in incoming payload', async () => {
      const qr = makeQueryRunner();
      // Existing: two rows. Payload: only one field → the other should be deleted
      const existingRow = { id: 'cv-1', productId: 'prod-1', fieldId: 'fd-text' };
      const toKeepRow  = { id: 'cv-2', productId: 'prod-1', fieldId: 'fd-num' };

      qr.manager.find.mockResolvedValue([existingRow, toKeepRow]);
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_NUMBER]),
        find: jest.fn().mockResolvedValue([toKeepRow]),
      });

      await (service as any).syncCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-num', valueText: '99' },
      ]);

      // cv-1 (fd-text) should be removed because it's not in payload
      expect(qr.manager.remove).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ fieldId: 'fd-text' })]),
      );
    });

    it('should not remove any rows when all existing fields are in payload', async () => {
      const qr = makeQueryRunner();
      const existingRow = { id: 'cv-1', productId: 'prod-1', fieldId: 'fd-text' };

      qr.manager.find.mockResolvedValue([existingRow]);
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_TEXT]),
        find: jest.fn().mockResolvedValue([existingRow]),
      });

      await (service as any).syncCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-text', valueText: 'Updated' },
      ]);

      expect(qr.manager.remove).not.toHaveBeenCalled();
    });

    it('should delete all existing rows when payload is empty', async () => {
      const qr = makeQueryRunner();
      const rows = [
        { id: 'cv-1', productId: 'prod-1', fieldId: 'fd-text' },
        { id: 'cv-2', productId: 'prod-1', fieldId: 'fd-num' },
      ];
      qr.manager.find.mockResolvedValue(rows);
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([]),
        find: jest.fn().mockResolvedValue([]),
      });

      await (service as any).syncCustomValues(qr, 'prod-1', []);

      expect(qr.manager.remove).toHaveBeenCalledWith(
        expect.anything(),
        rows,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // upsertCustomValues
  // ═══════════════════════════════════════════════════════════════════════════

  describe('upsertCustomValues', () => {
    it('should insert new ProductCustomValue row when field has no existing value', async () => {
      const qr = makeQueryRunner();
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_TEXT]), // definition found
      });
      qr.manager.find.mockResolvedValue([]); // no existing rows

      await (service as any).upsertCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-text', valueText: 'Hello' },
      ]);

      expect(qr.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            productId: 'prod-1',
            fieldId: 'fd-text',
            valueText: 'Hello',
            valueCatalogId: null,
          }),
        ]),
      );
    });

    it('should update existing row when field already has a value', async () => {
      const qr = makeQueryRunner();
      const existingRow = { id: 'cv-1', productId: 'prod-1', fieldId: 'fd-text', valueText: 'Old' };

      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_TEXT]),
      });
      qr.manager.find.mockResolvedValue([existingRow]);

      await (service as any).upsertCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-text', valueText: 'New' },
      ]);

      // Should save the same object reference with updated valueText
      expect(qr.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ id: 'cv-1', valueText: 'New' }),
        ]),
      );
    });

    it('should store value in valueCatalogId for CATALOG_REF field', async () => {
      const qr = makeQueryRunner();
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_CATALOG]),
      });
      qr.manager.find.mockResolvedValue([]);

      await (service as any).upsertCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-cat', valueCatalogId: 'item-uuid-1' },
      ]);

      expect(qr.manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            valueCatalogId: 'item-uuid-1',
            valueText: null,
          }),
        ]),
      );
    });

    it('should deduplicate by fieldId (last write wins)', async () => {
      const qr = makeQueryRunner();
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([DEF_TEXT]),
      });
      qr.manager.find.mockResolvedValue([]);

      await (service as any).upsertCustomValues(qr, 'prod-1', [
        { fieldId: 'fd-text', valueText: 'First' },
        { fieldId: 'fd-text', valueText: 'Last' },
      ]);

      const savedRows: any[] = (qr.manager.save as jest.Mock).mock.calls[0][1];
      expect(savedRows).toHaveLength(1);
      expect(savedRows[0].valueText).toBe('Last');
    });

    it('should skip saving when incoming values array is empty', async () => {
      const qr = makeQueryRunner();

      await (service as any).upsertCustomValues(qr, 'prod-1', []);

      expect(qr.manager.save).not.toHaveBeenCalled();
    });

    it('should skip rows where fieldId has no matching definition', async () => {
      const qr = makeQueryRunner();
      qr.manager.getRepository.mockReturnValue({
        findBy: jest.fn().mockResolvedValue([]), // no definitions found
      });
      qr.manager.find.mockResolvedValue([]);

      await (service as any).upsertCustomValues(qr, 'prod-1', [
        { fieldId: 'nonexistent-id', valueText: 'x' },
      ]);

      // Nothing to save — definition not found
      expect(qr.manager.save).not.toHaveBeenCalled();
    });
  });
});
