import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

// ── Mock Factories ───────────────────────────────────────────────────────────

function makeQueryRunner() {
  const qr = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    manager: {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'new-id', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        findBy: jest.fn().mockResolvedValue([]),
        find: jest.fn().mockResolvedValue([]),
      }),
    },
  };
  return qr;
}

function makeQueryBuilder() {
  const qb: any = {};
  const self = () => qb;
  qb.leftJoin = jest.fn().mockImplementation(self);
  qb.leftJoinAndSelect = jest.fn().mockImplementation(self);
  qb.andWhere = jest.fn().mockImplementation(self);
  qb.where = jest.fn().mockImplementation(self);
  qb.orderBy = jest.fn().mockImplementation(self);
  qb.addOrderBy = jest.fn().mockImplementation(self);
  qb.skip = jest.fn().mockImplementation(self);
  qb.take = jest.fn().mockImplementation(self);
  qb.select = jest.fn().mockImplementation(self);
  qb.addSelect = jest.fn().mockImplementation(self);
  qb.groupBy = jest.fn().mockImplementation(self);
  qb.clone = jest.fn().mockImplementation(() => qb);
  qb.limit = jest.fn().mockImplementation(self);
  qb.offset = jest.fn().mockImplementation(self);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => ({ id: 'new-id', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder()),
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
    __defaultRepo: defaultRepo,
  };
}

function makeTenantConnectionMock(ds: ReturnType<typeof makeDataSource>) {
  return {
    getTenantConnection: jest.fn().mockResolvedValue(ds),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PRODUCT_ID = 'prod-1';
const MEMBER_ID = 'member-1';
const SUPER_ADMIN_SENTINEL = '00000000-0000-0000-0000-000000000000';

const PRODUCT = {
  id: PRODUCT_ID,
  name: 'Test Product',
  description: 'A test product',
  delivery_date: '2026-06-01',
  status: 'active',
  ownerOrganizationId: 'org-1',
  countryId: 'country-1',
  country: { id: 'country-1', name: 'Mexico', code: 'MX' },
  ownerOrganization: { id: 'org-1', name: 'Test Org' },
  participatingOrganizations: [],
  members: [],
  strategies: [],
  customValues: [],
};

const CREATE_DTO = {
  name: 'New Product',
  description: 'Description',
  ownerOrganizationId: 'org-1',
  countryId: 'country-1',
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ProductsService', () => {
  let service: ProductsService;
  let ds: ReturnType<typeof makeDataSource>;
  let tenantConn: ReturnType<typeof makeTenantConnectionMock>;

  beforeEach(() => {
    ds = makeDataSource();
    tenantConn = makeTenantConnectionMock(ds);
    service = new ProductsService(tenantConn as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // findOne
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findOne', () => {
    it('should return product with attributes and customLinks', async () => {
      const productRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...PRODUCT }),
      });
      ds.getRepository.mockImplementation((entity: any) => {
        if (entity.name === 'Product' || entity === 'Product') return productRepo;
        return makeRepo(); // ProductCustomOrgLink repo etc.
      });
      // loadCustomLinks uses raw query
      ds.query.mockResolvedValue([]);

      const result = await service.findOne(PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Product');
      expect(result).toHaveProperty('attributes');
      expect(result).toHaveProperty('customLinks');
      expect(productRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PRODUCT_ID },
          relations: expect.arrayContaining(['country', 'ownerOrganization']),
        }),
      );
    });

    it('should throw NotFoundException when product not found', async () => {
      const productRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      ds.getRepository.mockReturnValue(productRepo);

      await expect(service.findOne('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    beforeEach(() => {
      // validateProductDto needs field definitions
      const fieldDefRepo = makeRepo({ find: jest.fn().mockResolvedValue([]) });
      ds.getRepository.mockImplementation((entity: any) => {
        const name = typeof entity === 'function' ? entity.name : entity;
        if (name === 'ProductFieldDefinition') return fieldDefRepo;
        // findOne (called at end of create) needs a product
        if (name === 'Product') return makeRepo({
          findOne: jest.fn().mockResolvedValue({ ...PRODUCT, id: 'new-id' }),
        });
        return makeRepo();
      });
      // loadCustomLinks
      ds.query.mockResolvedValue([]);
    });

    it('should create product in transaction and return it', async () => {
      const result = await service.create(CREATE_DTO as any, MEMBER_ID);

      expect(result).toBeDefined();
      expect(ds.__qr.connect).toHaveBeenCalled();
      expect(ds.__qr.startTransaction).toHaveBeenCalled();
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
      expect(ds.__qr.release).toHaveBeenCalled();
    });

    it('should add creator as PRODUCT_COORDINATOR member', async () => {
      await service.create(CREATE_DTO as any, MEMBER_ID);

      // manager.create is called with (EntityClass, data). Check for ProductMember data.
      const createCalls = ds.__qr.manager.create.mock.calls;
      const memberCreate = createCalls.find(
        (call: any[]) => call[1]?.memberId === MEMBER_ID && call[1]?.productRole,
      );
      expect(memberCreate).toBeDefined();
      expect(memberCreate[1].productRole).toBe('product_coordinator');
    });

    it('should NOT create product_member for SUPER_ADMIN sentinel', async () => {
      await service.create(CREATE_DTO as any, SUPER_ADMIN_SENTINEL);

      const saveCalls = ds.__qr.manager.save.mock.calls;
      const memberSave = saveCalls.find((call: any[]) =>
        call[0]?.productRole === 'PRODUCT_COORDINATOR',
      );
      expect(memberSave).toBeUndefined();
    });

    it('should create audit log entry with action CREATE', async () => {
      await service.create(CREATE_DTO as any, MEMBER_ID);

      const createCalls = ds.__qr.manager.create.mock.calls;
      const auditCreate = createCalls.find(
        (call: any[]) => call[1]?.action === 'CREATE' && call[1]?.entity === 'PRODUCT',
      );
      expect(auditCreate).toBeDefined();
    });

    it('should rollback transaction on error', async () => {
      ds.__qr.manager.save.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.create(CREATE_DTO as any, MEMBER_ID)).rejects.toThrow();
      expect(ds.__qr.rollbackTransaction).toHaveBeenCalled();
      expect(ds.__qr.release).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    beforeEach(() => {
      const productRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...PRODUCT }),
      });
      ds.getRepository.mockImplementation((entity: any) => {
        const name = typeof entity === 'function' ? entity.name : entity;
        if (name === 'Product') return productRepo;
        return makeRepo();
      });
      ds.query.mockResolvedValue([]);
    });

    it('should update standard fields within transaction', async () => {
      const dto = { name: 'Updated Name' };

      await service.update(PRODUCT_ID, dto as any, MEMBER_ID);

      expect(ds.__qr.manager.update).toHaveBeenCalledWith(
        expect.anything(), // Product class
        PRODUCT_ID,
        expect.objectContaining({ name: 'Updated Name' }),
      );
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if product not found', async () => {
      ds.getRepository.mockReturnValue(
        makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
      );

      await expect(service.update('nonexistent', { name: 'X' } as any, MEMBER_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('should create audit log with action UPDATE', async () => {
      await service.update(PRODUCT_ID, { name: 'Updated' } as any, MEMBER_ID);

      const createCalls = ds.__qr.manager.create.mock.calls;
      const auditCreate = createCalls.find(
        (call: any[]) => call[1]?.action === 'UPDATE' && call[1]?.entity === 'PRODUCT',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].entityId).toBe(PRODUCT_ID);
    });

    it('should rollback on error', async () => {
      ds.__qr.manager.update.mockRejectedValueOnce(new Error('constraint'));

      await expect(
        service.update(PRODUCT_ID, { name: 'X' } as any, MEMBER_ID),
      ).rejects.toThrow();
      expect(ds.__qr.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // remove
  // ═══════════════════════════════════════════════════════════════════════════

  describe('remove', () => {
    beforeEach(() => {
      ds.getRepository.mockReturnValue(
        makeRepo({ findOne: jest.fn().mockResolvedValue({ ...PRODUCT }) }),
      );
    });

    it('should delete product and return { deleted: true }', async () => {
      const result = await service.remove(PRODUCT_ID, MEMBER_ID);

      expect(result).toEqual({ deleted: true, id: PRODUCT_ID });
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if product not found', async () => {
      ds.getRepository.mockReturnValue(
        makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
      );

      await expect(service.remove('nonexistent', MEMBER_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('should create DELETE audit log before removing', async () => {
      await service.remove(PRODUCT_ID, MEMBER_ID);

      const createCalls = ds.__qr.manager.create.mock.calls;
      const auditCreate = createCalls.find(
        (call: any[]) => call[1]?.action === 'DELETE',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].changes).toEqual({ name: PRODUCT.name });
    });

    it('should clean up M2M relations before removing product', async () => {
      await service.remove(PRODUCT_ID, MEMBER_ID);

      // Should delete from pivot tables
      const queryCalls = ds.__qr.query.mock.calls;
      const deleteQueries = queryCalls.filter((c: any[]) =>
        typeof c[0] === 'string' && c[0].includes('DELETE'),
      );
      expect(deleteQueries.length).toBeGreaterThanOrEqual(3);
    });

    it('should rollback on FK constraint error', async () => {
      ds.__qr.manager.remove.mockRejectedValueOnce(
        Object.assign(new Error('FK violation'), { code: '23503' }),
      );

      await expect(service.remove(PRODUCT_ID, MEMBER_ID))
        .rejects.toThrow();
      expect(ds.__qr.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // validate
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validate', () => {
    it('should return { valid: true } for a valid DTO', async () => {
      ds.getRepository.mockReturnValue(makeRepo({ find: jest.fn().mockResolvedValue([]) }));

      const result = await service.validate(CREATE_DTO as any);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return { valid: false } with errors on validation failure', async () => {
      // Make org validation fail by providing org IDs that won't be found
      const dto = {
        ...CREATE_DTO,
        participatingOrganizationIds: ['missing-org'],
      };
      const orgRepo = makeRepo({
        find: jest.fn().mockResolvedValue([]),
        findBy: jest.fn().mockResolvedValue([]),
      });
      ds.getRepository.mockReturnValue(orgRepo);

      const result = await service.validate(dto as any);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getMyProducts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMyProducts', () => {
    it('should return mapped products for given member', async () => {
      const memberRepo = makeRepo({
        find: jest.fn().mockResolvedValue([
          {
            memberId: MEMBER_ID,
            productRole: 'PRODUCT_COORDINATOR',
            isResponsible: true,
            product: {
              id: PRODUCT_ID,
              name: 'Test Product',
              delivery_date: '2026-06-01',
              country: { id: 'c-1', name: 'Mexico', code: 'MX' },
              ownerOrganization: { id: 'o-1', name: 'Org' },
            },
          },
        ]),
      });
      ds.getRepository.mockReturnValue(memberRepo);

      const result = await service.getMyProducts(MEMBER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: PRODUCT_ID,
        name: 'Test Product',
        productRole: 'PRODUCT_COORDINATOR',
        isResponsible: true,
        delivery_date: '2026-06-01',
        country: { id: 'c-1', name: 'Mexico', code: 'MX' },
        ownerOrganization: { id: 'o-1', name: 'Org' },
      });
    });

    it('should filter out memberships with null product', async () => {
      const memberRepo = makeRepo({
        find: jest.fn().mockResolvedValue([
          { memberId: MEMBER_ID, product: null },
          {
            memberId: MEMBER_ID,
            productRole: 'VIEWER',
            isResponsible: false,
            product: {
              id: PRODUCT_ID,
              name: 'Valid',
              delivery_date: null,
              country: null,
              ownerOrganization: null,
            },
          },
        ]),
      });
      ds.getRepository.mockReturnValue(memberRepo);

      const result = await service.getMyProducts(MEMBER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].country).toBeNull();
      expect(result[0].ownerOrganization).toBeNull();
    });

    it('should return empty array when no memberships', async () => {
      ds.getRepository.mockReturnValue(makeRepo());

      const result = await service.getMyProducts(MEMBER_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProductMetrics
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProductMetrics', () => {
    it('should throw NotFoundException if product not found', async () => {
      const productRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      ds.getRepository.mockReturnValue(productRepo);

      await expect(service.getProductMetrics('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should return metrics with zero tasks when product has none', async () => {
      const productRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...PRODUCT }),
      });
      ds.getRepository.mockImplementation((entity: any) => {
        const name = typeof entity === 'function' ? entity.name : entity;
        if (name === 'Product') return productRepo;
        return makeRepo();
      });
      // statusRows query, phaseRows query, etc.
      ds.query.mockResolvedValue([]);

      const result = await service.getProductMetrics(PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.productSummary.totalTasks).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findAll
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      const qb = makeQueryBuilder();
      qb.getRawMany.mockResolvedValue([]); // id-only subquery
      qb.getCount.mockResolvedValue(0);
      const productRepo = makeRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      ds.getRepository.mockReturnValue(productRepo);

      const result = await service.findAll();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('should apply search filter when provided', async () => {
      const qb = makeQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      const productRepo = makeRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      ds.getRepository.mockReturnValue(productRepo);

      await service.findAll(1, 50, 'test');

      // search triggers leftJoin + andWhere with ILIKE
      expect(qb.leftJoin).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should apply organization filter', async () => {
      const qb = makeQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      const productRepo = makeRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      ds.getRepository.mockReturnValue(productRepo);

      await service.findAll(1, 50, undefined, 'org-1');

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should handle empty results gracefully', async () => {
      const qb = makeQueryBuilder();
      qb.getRawMany.mockResolvedValue([]);
      qb.getCount.mockResolvedValue(0);
      const productRepo = makeRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      ds.getRepository.mockReturnValue(productRepo);

      const result = await service.findAll(-1, -5);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
    });
  });
});
