import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductMembersService } from './product-members.service';

// ── Mock Factories ───────────────────────────────────────────────────────────

function makeQueryRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      create: jest.fn().mockImplementation((_e, data) => ({ id: 'pm-new', ...data })),
      save: jest.fn().mockImplementation((_e, data) => Promise.resolve(data)),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeQueryBuilder() {
  const qb: any = {};
  const self = () => qb;
  qb.select = jest.fn().mockImplementation(self);
  qb.where = jest.fn().mockImplementation(self);
  qb.limit = jest.fn().mockImplementation(self);
  qb.getRawOne = jest.fn().mockResolvedValue({ name: 'Test Product' });
  return qb;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
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
    __qr: qr,
  };
}

function makeTenantConn(ds: any) {
  return { getTenantConnection: jest.fn().mockResolvedValue(ds) };
}

function makeNotifications() {
  return { createNotification: jest.fn().mockResolvedValue(undefined) };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PRODUCT_ID = 'prod-1';
const MEMBER_ID = 'pm-1';
const WS_MEMBER_ID = 'ws-m-1';
const ACTOR_ID = 'actor-1';

const WORKSPACE_MEMBER = {
  id: WS_MEMBER_ID,
  organization: { id: 'org-1', name: 'Test Org' },
};

const PRODUCT_MEMBER = {
  id: MEMBER_ID,
  productId: PRODUCT_ID,
  memberId: WS_MEMBER_ID,
  productRole: 'viewer',
  allocation_percentage: 50,
  isResponsible: false,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ProductMembersService', () => {
  let service: ProductMembersService;
  let ds: ReturnType<typeof makeDataSource>;
  let notifications: ReturnType<typeof makeNotifications>;

  beforeEach(() => {
    ds = makeDataSource({
      WorkspaceMember: makeRepo({ findOne: jest.fn().mockResolvedValue({ ...WORKSPACE_MEMBER }) }),
      ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
      Product: makeRepo(),
    });
    notifications = makeNotifications();
    service = new ProductMembersService(
      makeTenantConn(ds) as any,
      notifications as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // addMember
  // ═══════════════════════════════════════════════════════════════════════════

  describe('addMember', () => {
    const ADD_DTO = { memberId: WS_MEMBER_ID, role: 'viewer', allocation: 50 };

    it('should add a member and commit transaction', async () => {
      const result = await service.addMember(PRODUCT_ID, ADD_DTO as any, ACTOR_ID);

      expect(result).toBeDefined();
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
      expect(ds.__qr.release).toHaveBeenCalled();
    });

    it('should create audit log with CREATE action', async () => {
      await service.addMember(PRODUCT_ID, ADD_DTO as any, ACTOR_ID);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'CREATE' && call[1]?.entity === 'product_member',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].actorMemberId).toBe(ACTOR_ID);
    });

    it('should throw NotFoundException if workspace member not found', async () => {
      ds = makeDataSource({
        WorkspaceMember: makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
        ProductMember: makeRepo(),
        Product: makeRepo(),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);

      await expect(service.addMember(PRODUCT_ID, ADD_DTO as any, ACTOR_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if member already in product', async () => {
      ds = makeDataSource({
        WorkspaceMember: makeRepo({ findOne: jest.fn().mockResolvedValue({ ...WORKSPACE_MEMBER }) }),
        ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue({ ...PRODUCT_MEMBER }) }),
        Product: makeRepo(),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);

      await expect(service.addMember(PRODUCT_ID, ADD_DTO as any, ACTOR_ID))
        .rejects.toThrow(BadRequestException);
    });

    it('should send notification after adding member', async () => {
      await service.addMember(PRODUCT_ID, ADD_DTO as any, ACTOR_ID);

      // notification is fire-and-forget (void), but createNotification should be called
      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.anything(),
        WS_MEMBER_ID,
        'PRODUCT_MEMBER_ADDED',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ entityType: 'PRODUCT', entityId: PRODUCT_ID }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateMember
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateMember', () => {
    beforeEach(() => {
      ds = makeDataSource({
        ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue({ ...PRODUCT_MEMBER }) }),
        Product: makeRepo(),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);
    });

    it('should update role and commit transaction', async () => {
      const result = await service.updateMember(PRODUCT_ID, MEMBER_ID, { role: 'product_coordinator' } as any, ACTOR_ID);

      expect(result.productRole).toBe('product_coordinator');
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if membership not found', async () => {
      ds = makeDataSource({
        ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);

      await expect(service.updateMember(PRODUCT_ID, MEMBER_ID, {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('should log old and new values in audit', async () => {
      await service.updateMember(PRODUCT_ID, MEMBER_ID, { role: 'product_coordinator' } as any, ACTOR_ID);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'UPDATE',
      );
      expect(auditCreate[1].changes.old).toHaveProperty('productRole', 'viewer');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // removeMember
  // ═══════════════════════════════════════════════════════════════════════════

  describe('removeMember', () => {
    beforeEach(() => {
      ds = makeDataSource({
        ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue({ ...PRODUCT_MEMBER }) }),
        Product: makeRepo(),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);
    });

    it('should remove member and commit transaction', async () => {
      await service.removeMember(PRODUCT_ID, MEMBER_ID, ACTOR_ID);

      expect(ds.__qr.manager.remove).toHaveBeenCalled();
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if membership not found', async () => {
      ds = makeDataSource({
        ProductMember: makeRepo({ findOne: jest.fn().mockResolvedValue(null) }),
      });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);

      await expect(service.removeMember(PRODUCT_ID, 'bad-id', ACTOR_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('should send PRODUCT_MEMBER_REMOVED notification', async () => {
      await service.removeMember(PRODUCT_ID, MEMBER_ID, ACTOR_ID);

      expect(notifications.createNotification).toHaveBeenCalledWith(
        expect.anything(),
        WS_MEMBER_ID,
        'PRODUCT_MEMBER_REMOVED',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ entityType: 'PRODUCT' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProjectTeam
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProjectTeam', () => {
    it('should return members with relations', async () => {
      const pmRepo = makeRepo({
        find: jest.fn().mockResolvedValue([PRODUCT_MEMBER]),
      });
      ds = makeDataSource({ ProductMember: pmRepo });
      service = new ProductMembersService(makeTenantConn(ds) as any, notifications as any);

      const result = await service.getProjectTeam(PRODUCT_ID);

      expect(result).toHaveLength(1);
      expect(pmRepo.find).toHaveBeenCalledWith({
        where: { productId: PRODUCT_ID },
        relations: ['member', 'member.organization'],
      });
    });
  });
});
