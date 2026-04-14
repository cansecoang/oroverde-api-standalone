import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

// ── Mock Factories ───────────────────────────────────────────────────────────

function makeQueryRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      create: jest.fn().mockImplementation((_e, data) => ({ id: 'audit-id', ...data })),
      save: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeQueryBuilder() {
  const qb: any = {};
  const self = () => qb;
  qb.leftJoinAndSelect = jest.fn().mockImplementation(self);
  qb.where = jest.fn().mockImplementation(self);
  qb.orderBy = jest.fn().mockImplementation(self);
  qb.limit = jest.fn().mockImplementation(self);
  qb.offset = jest.fn().mockImplementation(self);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getOne = jest.fn().mockResolvedValue(null);
  return qb;
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => ({ id: 'task-new', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    remove: jest.fn().mockResolvedValue(undefined),
    merge: jest.fn().mockImplementation((target, src) => Object.assign(target, src)),
    createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder()),
    ...overrides,
  };
}

function makeDataSource(taskRepo?: any) {
  const qr = makeQueryRunner();
  const defaultRepo = makeRepo();
  return {
    getRepository: jest.fn().mockImplementation((entity: any) => {
      const name = typeof entity === 'function' ? entity.name : entity;
      if (name === 'Task' && taskRepo) return taskRepo;
      return defaultRepo;
    }),
    createQueryRunner: jest.fn().mockReturnValue(qr),
    __qr: qr,
  };
}

function makeTenantConn(ds: any) {
  return { getTenantConnection: jest.fn().mockResolvedValue(ds) };
}

function makeNotifications() {
  return { create: jest.fn().mockResolvedValue(undefined) };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TASK_ID = 'task-1';
const PRODUCT_ID = 'prod-1';
const MEMBER_ID = 'member-1';

const TASK = {
  id: TASK_ID,
  title: 'Test Task',
  productId: PRODUCT_ID,
  statusId: 'status-1',
  assigneeMemberId: null,
  assignedOrganizationId: null,
  createdAt: new Date(),
};

const ACTOR = { workspaceMemberId: MEMBER_ID, tenantRole: 'general_coordinator' };

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TasksService', () => {
  let service: TasksService;
  let ds: ReturnType<typeof makeDataSource>;
  let taskRepo: ReturnType<typeof makeRepo>;
  let notifications: ReturnType<typeof makeNotifications>;

  beforeEach(() => {
    const qb = makeQueryBuilder();
    // findOneWithRelations uses getMany() and expects results[0]
    qb.getMany.mockResolvedValue([{ ...TASK }]);
    taskRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ ...TASK }),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    ds = makeDataSource(taskRepo);
    notifications = makeNotifications();
    service = new TasksService(
      makeTenantConn(ds) as any,
      notifications as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should create a task and return it', async () => {
      const dto = { title: 'New Task', productId: PRODUCT_ID };
      taskRepo.create.mockReturnValue({ id: 'task-new', ...dto });
      taskRepo.save.mockResolvedValue({ id: 'task-new', ...dto });

      const result = await service.create(dto as any, ACTOR);

      expect(result).toBeDefined();
      expect(taskRepo.create).toHaveBeenCalledWith(dto);
      expect(taskRepo.save).toHaveBeenCalled();
    });

    it('should create audit log with action CREATE', async () => {
      const dto = { title: 'New Task', productId: PRODUCT_ID };
      taskRepo.create.mockReturnValue({ id: 'task-new', ...dto });
      taskRepo.save.mockResolvedValue({ id: 'task-new', ...dto });

      await service.create(dto as any, ACTOR);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'CREATE' && call[1]?.entity === 'task',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].actorMemberId).toBe(MEMBER_ID);
    });

    it('should set actorMemberId to null when no actor', async () => {
      const dto = { title: 'New Task', productId: PRODUCT_ID };
      taskRepo.create.mockReturnValue({ id: 'task-new', ...dto });
      taskRepo.save.mockResolvedValue({ id: 'task-new', ...dto });

      await service.create(dto as any);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'CREATE',
      );
      expect(auditCreate[1].actorMemberId).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateStatus
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateStatus', () => {
    it('should update task statusId and commit transaction', async () => {
      const dto = { statusId: 'status-2' };

      await service.updateStatus(TASK_ID, dto as any, ACTOR);

      // task.statusId was updated and saved
      expect(ds.__qr.manager.save).toHaveBeenCalled();
      expect(ds.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      taskRepo.findOne.mockResolvedValue(null);
      ds.getRepository.mockReturnValue(taskRepo);

      await expect(service.updateStatus('bad-id', { statusId: 'x' } as any, ACTOR))
        .rejects.toThrow(NotFoundException);
    });

    it('should log old and new statusId in audit', async () => {
      const dto = { statusId: 'status-2' };

      await service.updateStatus(TASK_ID, dto as any, ACTOR);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'UPDATE',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].changes.old.statusId).toBe('status-1');
      expect(auditCreate[1].changes.new.statusId).toBe('status-2');
    });

    it('should rollback on error and rethrow', async () => {
      ds.__qr.manager.save.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.updateStatus(TASK_ID, { statusId: 'x' } as any, ACTOR),
      ).rejects.toThrow('DB error');
      expect(ds.__qr.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('should merge and save update data', async () => {
      const updateData = { title: 'Updated Title' };

      await service.update(TASK_ID, updateData, ACTOR);

      expect(taskRepo.merge).toHaveBeenCalled();
      expect(taskRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', { title: 'x' }, ACTOR))
        .rejects.toThrow(NotFoundException);
    });

    it('should strip productId to prevent moving task', async () => {
      const updateData = { title: 'X', productId: 'other-product' };

      await service.update(TASK_ID, updateData, ACTOR);

      // productId should be deleted before merge
      expect(taskRepo.merge).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ productId: 'other-product' }),
      );
    });

    it('should create audit log with old and new snapshots', async () => {
      await service.update(TASK_ID, { title: 'New' }, ACTOR);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'UPDATE' && call[1]?.entity === 'task',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].changes.old).toHaveProperty('title');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // remove
  // ═══════════════════════════════════════════════════════════════════════════

  describe('remove', () => {
    it('should remove task and return { deleted: true }', async () => {
      const result = await service.remove(TASK_ID, ACTOR);

      expect(result).toEqual({ deleted: true, id: TASK_ID });
      expect(taskRepo.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('bad-id', ACTOR))
        .rejects.toThrow(NotFoundException);
    });

    it('should create DELETE audit log with task snapshot', async () => {
      await service.remove(TASK_ID, ACTOR);

      const auditCreate = ds.__qr.manager.create.mock.calls.find(
        (call: any[]) => call[1]?.action === 'DELETE',
      );
      expect(auditCreate).toBeDefined();
      expect(auditCreate[1].changes).toEqual({
        title: TASK.title,
        productId: TASK.productId,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findByProject
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findByProject', () => {
    it('should return paginated tasks for a product', async () => {
      const qb = makeQueryBuilder();
      qb.getCount.mockResolvedValue(1);
      qb.getMany.mockResolvedValue([TASK]);
      taskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByProject(PRODUCT_ID);

      expect(result).toEqual({
        data: [TASK],
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('should apply pagination parameters', async () => {
      const qb = makeQueryBuilder();
      qb.getCount.mockResolvedValue(100);
      qb.getMany.mockResolvedValue([]);
      taskRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findByProject(PRODUCT_ID, 2, 10);

      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(qb.offset).toHaveBeenCalledWith(10); // (2-1)*10
    });

    it('should return empty data when no tasks exist', async () => {
      const qb = makeQueryBuilder();
      taskRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByProject(PRODUCT_ID);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
