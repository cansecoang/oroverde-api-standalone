import { NotificationsService } from './notifications.service';
import { TenantRole } from '../../../common/enums/business-roles.enum';

// ── Factories ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

function makeNotifRepo(overrides: Partial<{ create: any; save: any }> = {}) {
  const created: Record<string, any> = {};
  return {
    create: jest.fn().mockImplementation((data) => ({ id: 'notif-new', ...data })),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeWsMemberRepo(coordinators: Array<{ id: string }> = []) {
  return {
    find: jest.fn().mockResolvedValue(coordinators),
  };
}

function makeProductMemberRepo(members: Array<{ memberId?: string; id?: string }> = []) {
  return {
    find: jest.fn().mockResolvedValue(members),
  };
}

function makeDs(
  notifRepo = makeNotifRepo(),
  wsMemberRepo = makeWsMemberRepo(),
  productMemberRepo = makeProductMemberRepo(),
) {
  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : String(entity);
      if (name === 'Notification') return notifRepo;
      if (name === 'WorkspaceMember') return wsMemberRepo;
      if (name === 'ProductMember') return productMemberRepo;
      return { create: jest.fn(), save: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    }),
  };
}

function makeService(): NotificationsService {
  return new NotificationsService({ getTenantConnection: jest.fn() } as any);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // createNotification — best-effort, never throws
  // TEST_PLAN: UC-NOTIF-001, UC-NOTIF-003
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createNotification', () => {
    it('should create and save notification for a valid member', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo);
      const service = makeService();

      await service.createNotification(ds as any, 'member-1', 'TASK_ASSIGNED', 'Nueva tarea', 'Se te asignó una tarea');

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientMemberId: 'member-1',
          type: 'TASK_ASSIGNED',
          title: 'Nueva tarea',
          message: 'Se te asignó una tarea',
        }),
      );
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('should do nothing for the SUPER_ADMIN sentinel member ID', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo);
      const service = makeService();

      await service.createNotification(ds as any, SUPER_ADMIN_SENTINEL_ID, 'TASK_ASSIGNED', 'T', 'M');

      expect(notifRepo.create).not.toHaveBeenCalled();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });

    it('should do nothing for empty recipientMemberId', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo);
      const service = makeService();

      await service.createNotification(ds as any, '', 'TYPE', 'T', 'M');

      expect(notifRepo.create).not.toHaveBeenCalled();
    });

    it('should swallow errors (best-effort — never throws to caller)', async () => {
      const failingRepo = makeNotifRepo({
        save: jest.fn().mockRejectedValue(new Error('DB is down')),
      });
      const ds = makeDs(failingRepo);
      const service = makeService();

      // Must NOT throw
      await expect(
        service.createNotification(ds as any, 'member-1', 'TYPE', 'T', 'M'),
      ).resolves.toBeUndefined();
    });

    it('should store optional opts fields (entityType, entityId, metadata)', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo);
      const service = makeService();

      await service.createNotification(ds as any, 'member-1', 'TYPE', 'T', 'M', {
        entityType: 'Product',
        entityId: 'prod-1',
        metadata: { extra: true },
      });

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Product',
          entityId: 'prod-1',
          metadata: { extra: true },
        }),
      );
    });

    it('should use null for omitted optional opts fields', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo);
      const service = makeService();

      await service.createNotification(ds as any, 'member-1', 'TYPE', 'T', 'M');

      expect(notifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: null,
          entityId: null,
          metadata: null,
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // notifyAllCoordinators — broadcasts to all GCs
  // TEST_PLAN: UC-NOTIF-001
  // ═══════════════════════════════════════════════════════════════════════════

  describe('notifyAllCoordinators', () => {
    it('should call createNotification once per coordinator', async () => {
      const coordinators = [{ id: 'gc-1' }, { id: 'gc-2' }];
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo, makeWsMemberRepo(coordinators));
      const service = makeService();

      await service.notifyAllCoordinators(ds as any, 'TYPE', 'Title', 'Message');

      expect(notifRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should query WorkspaceMember with tenantRole GENERAL_COORDINATOR', async () => {
      const wsMemberRepo = makeWsMemberRepo([]);
      const ds = makeDs(makeNotifRepo(), wsMemberRepo);
      const service = makeService();

      await service.notifyAllCoordinators(ds as any, 'TYPE', 'T', 'M');

      expect(wsMemberRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantRole: TenantRole.GENERAL_COORDINATOR },
        }),
      );
    });

    it('should swallow errors (best-effort)', async () => {
      const failingWsRepo = { find: jest.fn().mockRejectedValue(new Error('DB fail')) };
      const ds = makeDs(makeNotifRepo(), failingWsRepo as any);
      const service = makeService();

      await expect(
        service.notifyAllCoordinators(ds as any, 'TYPE', 'T', 'M'),
      ).resolves.toBeUndefined();
    });

    it('should not call save when there are no coordinators', async () => {
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo, makeWsMemberRepo([]));
      const service = makeService();

      await service.notifyAllCoordinators(ds as any, 'TYPE', 'T', 'M');

      expect(notifRepo.save).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // notifyProductMembers — broadcasts to all members of a product
  // TEST_PLAN: UC-NOTIF-001
  // ═══════════════════════════════════════════════════════════════════════════

  describe('notifyProductMembers', () => {
    it('should notify each product member using memberId field', async () => {
      // Service calls pm.memberId (not pm.id) — fixtures must match
      const productMembers = [
        { memberId: 'member-1' },
        { memberId: 'member-2' },
        { memberId: 'member-3' },
      ];
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo, makeWsMemberRepo(), makeProductMemberRepo(productMembers));
      const service = makeService();

      await service.notifyProductMembers(ds as any, 'prod-1', 'TYPE', 'Title', 'Msg');

      expect(notifRepo.save).toHaveBeenCalledTimes(3);
    });

    it('should not notify sentinel member IDs in the product team', async () => {
      const productMembers = [
        { memberId: 'member-1' },
        { memberId: SUPER_ADMIN_SENTINEL_ID }, // should be skipped
      ];
      const notifRepo = makeNotifRepo();
      const ds = makeDs(notifRepo, makeWsMemberRepo(), makeProductMemberRepo(productMembers));
      const service = makeService();

      await service.notifyProductMembers(ds as any, 'prod-1', 'TYPE', 'Title', 'Msg');

      // sentinel is skipped — only 1 save
      expect(notifRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should swallow errors on notifyProductMembers (best-effort)', async () => {
      const failingPmRepo = { find: jest.fn().mockRejectedValue(new Error('DB fail')) };
      const ds = makeDs(makeNotifRepo(), makeWsMemberRepo(), failingPmRepo as any);
      const service = makeService();

      await expect(
        service.notifyProductMembers(ds as any, 'prod-1', 'TYPE', 'T', 'M'),
      ).resolves.toBeUndefined();
    });
  });
});
