import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StrategyService } from './strategy.service';

// ── Mock Factories ───────────────────────────────────────────────────────────

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data) => ({ id: 'new-id', ...data })),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
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
    query: jest.fn().mockResolvedValue([]),
  };
}

function makeTenantConn(ds: any) {
  return {
    getTenantConnection: jest.fn().mockResolvedValue(ds),
    getCurrentTenantDateWindow: jest.fn().mockResolvedValue({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    }),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OUTPUT = {
  id: 'output-1',
  name: 'Output One',
  code: 'Output 1',
  order: 1,
};

const INDICATOR = {
  id: 'ind-1',
  code: '1.1',
  description: 'Test Indicator',
  unit: 'units',
  total_target: 100,
  output: OUTPUT,
};

const ASSIGNMENT = {
  id: 'assign-1',
  productId: 'prod-1',
  indicatorId: 'ind-1',
  committed_target: 50,
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('StrategyService', () => {
  let service: StrategyService;
  let ds: ReturnType<typeof makeDataSource>;

  beforeEach(() => {
    ds = makeDataSource();
    service = new StrategyService(makeTenantConn(ds) as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // createOutput
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createOutput', () => {
    it('should create an output with auto-generated code', async () => {
      const outputRepo = makeRepo();
      ds = makeDataSource({ StrategicOutput: outputRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      const result = await service.createOutput({ name: 'New Output', order: 2 } as any);

      expect(result).toBeDefined();
      expect(outputRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'Output 2' }),
      );
    });

    it('should throw BadRequestException if order already exists', async () => {
      const outputRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...OUTPUT }),
      });
      ds = makeDataSource({ StrategicOutput: outputRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(service.createOutput({ name: 'Dup', order: 1 } as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createIndicator
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createIndicator', () => {
    it('should create indicator with hierarchical code (output.order.indicatorNumber)', async () => {
      const outputRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...OUTPUT }),
      });
      const indRepo = makeRepo();
      ds = makeDataSource({ StrategicOutput: outputRepo, StrategicIndicator: indRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      const dto = { outputId: 'output-1', indicatorNumber: 3, description: 'Desc', unit: 'kg' };
      await service.createIndicator(dto as any);

      expect(indRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: '1.3' }),
      );
    });

    it('should throw NotFoundException if output does not exist', async () => {
      const outputRepo = makeRepo();
      ds = makeDataSource({ StrategicOutput: outputRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.createIndicator({ outputId: 'bad', indicatorNumber: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if indicator code already exists', async () => {
      const outputRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...OUTPUT }),
      });
      const indRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...INDICATOR }),
      });
      ds = makeDataSource({ StrategicOutput: outputRepo, StrategicIndicator: indRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.createIndicator({ outputId: 'output-1', indicatorNumber: 1 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // assignToProject
  // ═══════════════════════════════════════════════════════════════════════════

  describe('assignToProject', () => {
    it('should create an assignment for a product-indicator pair', async () => {
      const psRepo = makeRepo();
      ds = makeDataSource({ ProductStrategy: psRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      const dto = { productId: 'prod-1', indicatorId: 'ind-1', target: 50 };
      await service.assignToProject(dto as any);

      expect(psRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          indicatorId: 'ind-1',
          committed_target: 50,
        }),
      );
    });

    it('should throw if assignment already exists', async () => {
      const psRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ASSIGNMENT }),
      });
      ds = makeDataSource({ ProductStrategy: psRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.assignToProject({ productId: 'prod-1', indicatorId: 'ind-1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateCommittedTarget
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateCommittedTarget', () => {
    it('should update committed target', async () => {
      const psRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ASSIGNMENT }),
      });
      ds = makeDataSource({ ProductStrategy: psRepo });
      // getProductTaskProgress uses raw query
      ds.query.mockResolvedValue([{ total_tasks: '5', completed_tasks: '2' }]);
      service = new StrategyService(makeTenantConn(ds) as any);

      const result = await service.updateCommittedTarget('prod-1', 'assign-1', 75);

      expect(result.committed_target).toBe(75);
      expect(psRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if assignment not found', async () => {
      const psRepo = makeRepo();
      ds = makeDataSource({ ProductStrategy: psRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.updateCommittedTarget('prod-1', 'bad-id', 50),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for negative target', async () => {
      ds = makeDataSource();
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.updateCommittedTarget('prod-1', 'assign-1', -10),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if target < completed tasks', async () => {
      const psRepo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ASSIGNMENT }),
      });
      ds = makeDataSource({ ProductStrategy: psRepo });
      ds.query.mockResolvedValue([{ total_tasks: '10', completed_tasks: '8' }]);
      service = new StrategyService(makeTenantConn(ds) as any);

      await expect(
        service.updateCommittedTarget('prod-1', 'assign-1', 5),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // reportProgress (deprecated)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reportProgress', () => {
    it('should throw BadRequestException (deprecated — progress is automatic)', async () => {
      await expect(service.reportProgress({} as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getFullStrategyTree
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getFullStrategyTree', () => {
    it('should return outputs with nested indicators and contributions', async () => {
      const outputRepo = makeRepo({
        find: jest.fn().mockResolvedValue([OUTPUT]),
      });
      ds = makeDataSource({ StrategicOutput: outputRepo });
      service = new StrategyService(makeTenantConn(ds) as any);

      const result = await service.getFullStrategyTree();

      expect(result).toHaveLength(1);
      expect(outputRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['indicators']),
          order: expect.objectContaining({ order: 'ASC' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findProjectStrategy
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findProjectStrategy', () => {
    it('should return assignments enriched with task progress', async () => {
      const psRepo = makeRepo({
        find: jest.fn().mockResolvedValue([{ ...ASSIGNMENT }]),
      });
      ds = makeDataSource({ ProductStrategy: psRepo });
      ds.query.mockResolvedValue([{ total_tasks: '10', completed_tasks: '3' }]);
      service = new StrategyService(makeTenantConn(ds) as any);

      const result = await service.findProjectStrategy('prod-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('completedTasks');
      expect(result[0]).toHaveProperty('totalTasks');
      expect(result[0]).toHaveProperty('tasksCompletionPercentage');
    });

    it('should return empty array when no assignments', async () => {
      ds = makeDataSource();
      service = new StrategyService(makeTenantConn(ds) as any);
      ds.query.mockResolvedValue([{ total_tasks: '0', completed_tasks: '0' }]);

      const result = await service.findProjectStrategy('prod-1');
      expect(result).toHaveLength(0);
    });
  });
});
