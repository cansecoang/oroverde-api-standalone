import { NotFoundException } from '@nestjs/common';
import { ProjectCheckInsService } from './project-checkins.service';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeQueryRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'audit-new', ...data })),
      save: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeQueryBuilder() {
  const qb: any = {};
  const self = () => qb;
  qb.where = jest.fn().mockImplementation(self);
  qb.andWhere = jest.fn().mockImplementation(self);
  qb.select = jest.fn().mockImplementation(self);
  qb.orderBy = jest.fn().mockImplementation(self);
  qb.addOrderBy = jest.fn().mockImplementation(self);
  qb.limit = jest.fn().mockImplementation(self);
  qb.offset = jest.fn().mockImplementation(self);
  qb.leftJoinAndSelect = jest.fn().mockImplementation(self);
  qb.clone = jest.fn().mockReturnValue(qb);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  qb.getMany = jest.fn().mockResolvedValue([]);
  return qb;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => ({ id: 'ci-new', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'ci-saved', ...data })),
    remove: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder()),
    ...overrides,
  };
}

function makeDataSource(
  checkInRepo = makeRepo(),
  productMemberRepo = makeRepo(),
  productRepo = makeRepo(),
) {
  const qr = makeQueryRunner();
  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : String(entity);
      if (name === 'ProjectCheckIn') return checkInRepo;
      if (name === 'ProductMember') return productMemberRepo;
      if (name === 'Product') return productRepo;
      return makeRepo(); // AuditLog and others
    }),
    createQueryRunner: jest.fn().mockReturnValue(qr),
    __qr: qr,
  };
}

function makeTenantConn(ds: any) {
  return { getTenantConnection: jest.fn().mockResolvedValue(ds) };
}

function makeNotifications() {
  return {
    notifyProductMembers: jest.fn().mockResolvedValue(undefined),
    createNotification: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHECKIN_FIXTURE = {
  id: 'ci-1',
  productId: 'prod-1',
  title: 'Weekly Sync',
  topic: 'Progress review',
  scheduled_at: new Date('2026-05-01T10:00:00Z'),
  meeting_link: 'https://meet.example.com',
  is_completed: false,
  notes: null,
  attendees: [],
  linkedTasks: [],
};

const PRODUCT_MEMBER_FIXTURE = {
  id: 'pm-1',
  memberId: 'member-user-1',
  productId: 'prod-1',
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('ProjectCheckInsService', () => {
  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // findOne
  // UC-OPS-009, TEST_PLAN: TP-OPS-005
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findOne', () => {
    it('should return check-in when found', async () => {
      const checkInRepo = makeRepo({ findOne: jest.fn().mockResolvedValue({ ...CHECKIN_FIXTURE }) });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const result = await service.findOne('ci-1');

      expect(result).toMatchObject({ id: 'ci-1', title: 'Weekly Sync' });
      expect(checkInRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ci-1' } }),
      );
    });

    it('should throw NotFoundException when check-in does not exist', async () => {
      const checkInRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // schedule (create)
  // UC-OPS-007, TEST_PLAN: TP-OPS-005, TP-OPS-006
  // ═══════════════════════════════════════════════════════════════════════════

  describe('schedule', () => {
    it('should create check-in when organizer is a valid product member', async () => {
      const productMemberRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...PRODUCT_MEMBER_FIXTURE }),
        find: jest.fn().mockResolvedValue([]),
      });
      const savedCheckIn = { ...CHECKIN_FIXTURE };
      const checkInRepo = makeRepo({
        create: jest.fn().mockReturnValue(savedCheckIn),
        save: jest.fn().mockResolvedValue(savedCheckIn),
        // findOne for the final findOne() call after save
        findOne: jest.fn().mockResolvedValue(savedCheckIn),
      });
      const ds = makeDataSource(checkInRepo, productMemberRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const dto = {
        productId: 'prod-1',
        organizerId: 'member-user-1',
        title: 'Weekly Sync',
        scheduled_at: new Date('2026-05-01T10:00:00Z'),
        attendeeIds: [],
        linkedTaskIds: [],
      };

      const result = await service.schedule(dto as any);

      expect(checkInRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'ci-1' });
    });

    it('should throw NotFoundException when organizer is not a product member', async () => {
      const productMemberRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue(null), // organizer not found
      });
      const ds = makeDataSource(makeRepo(), productMemberRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const dto = {
        productId: 'prod-1',
        organizerId: 'not-a-member',
        title: 'Weekly Sync',
        scheduled_at: new Date('2026-05-01T10:00:00Z'),
        attendeeIds: [],
        linkedTaskIds: [],
      };

      await expect(service.schedule(dto as any)).rejects.toThrow(NotFoundException);
    });

    it('should insert AuditLog with action CREATE on success', async () => {
      const productMemberRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...PRODUCT_MEMBER_FIXTURE }),
        find: jest.fn().mockResolvedValue([]),
      });
      const savedCheckIn = { ...CHECKIN_FIXTURE };
      const checkInRepo = makeRepo({
        create: jest.fn().mockReturnValue(savedCheckIn),
        save: jest.fn().mockResolvedValue(savedCheckIn),
        findOne: jest.fn().mockResolvedValue(savedCheckIn),
      });
      const ds = makeDataSource(checkInRepo, productMemberRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const dto = {
        productId: 'prod-1',
        organizerId: 'member-user-1',
        title: 'Weekly Sync',
        scheduled_at: new Date('2026-05-01T10:00:00Z'),
        attendeeIds: [],
        linkedTaskIds: [],
      };

      await service.schedule(dto as any, { workspaceMemberId: 'actor-ws-1' });

      const qr = (ds as any).__qr;
      expect(qr.manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'CREATE', entity: 'project_checkin' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // complete
  // UC-OPS-010, TEST_PLAN: TP-OPS-007
  // ═══════════════════════════════════════════════════════════════════════════

  describe('complete', () => {
    it('should set is_completed = true and save notes', async () => {
      const existingCheckIn = { ...CHECKIN_FIXTURE, is_completed: false };
      const checkInRepo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(existingCheckIn)           // first findOne in complete()
          .mockResolvedValueOnce({ ...existingCheckIn, is_completed: true }), // findOne() at end
        save: jest.fn().mockResolvedValue({ ...existingCheckIn, is_completed: true, notes: 'Meeting notes here' }),
      });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const dto = { notes: 'Meeting notes here' };
      await service.complete('ci-1', dto as any);

      expect(checkInRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ is_completed: true, notes: 'Meeting notes here' }),
      );
    });

    it('should throw NotFoundException when check-in not found', async () => {
      const checkInRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      await expect(service.complete('nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should insert AuditLog with action UPDATE on complete', async () => {
      const existingCheckIn = { ...CHECKIN_FIXTURE };
      const checkInRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue(existingCheckIn),
        save: jest.fn().mockResolvedValue({ ...existingCheckIn, is_completed: true }),
      });
      // verifyProductAccess calls ProductMember repo — mock it to return a valid membership
      const productMemberRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ id: 'pm-1', memberId: 'actor-1', productId: 'prod-1' }),
      });
      const ds = makeDataSource(checkInRepo, productMemberRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      await service.complete('ci-1', { notes: 'Done' } as any, { workspaceMemberId: 'actor-1' });

      const qr = (ds as any).__qr;
      expect(qr.manager.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'UPDATE', entity: 'project_checkin' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update
  // UC-OPS-011, TEST_PLAN: TP-OPS-005
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('should throw NotFoundException when check-in not found', async () => {
      const checkInRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      await expect(service.update('nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('should update title and save', async () => {
      const existing = { ...CHECKIN_FIXTURE, attendees: [], linkedTasks: [] };
      const checkInRepo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce({ ...existing, title: 'Updated Title' }),
        save: jest.fn().mockResolvedValue({ ...existing, title: 'Updated Title' }),
      });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      await service.update('ci-1', { title: 'Updated Title' } as any);

      expect(checkInRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated Title' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findByProduct — pagination sanity
  // UC-OPS-008, TEST_PLAN regression guard (query-safety.spec.ts covers the pattern)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findByProduct', () => {
    it('should clamp pastLimit to max 100', async () => {
      const checkInRepo = makeRepo();
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const result = await service.findByProduct('prod-1', 1, 9999);

      // pastLimit returned in result should be clamped
      expect(result.pastLimit).toBe(100);
    });

    it('should default to page 1 for invalid page values', async () => {
      const checkInRepo = makeRepo();
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const result = await service.findByProduct('prod-1', -5, 10);

      expect(result.pastPage).toBe(1);
    });

    it('should return nextCheckin as null when no upcoming check-ins', async () => {
      const checkInRepo = makeRepo({ find: jest.fn().mockResolvedValue([]) });
      const ds = makeDataSource(checkInRepo);
      const service = new ProjectCheckInsService(makeTenantConn(ds) as any, makeNotifications() as any);

      const result = await service.findByProduct('prod-1', 1, 10);

      expect(result.nextCheckin).toBeNull();
      expect(result.upcoming).toHaveLength(0);
    });
  });
});
