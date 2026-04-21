import { TenantConnectionService, getAppPlaneDataSourceBySlug, drainTenantPool } from './tenant-connection.service';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

// ── Mock DataSource ──────────────────────────────────────────────────────────

const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockDestroy = jest.fn().mockResolvedValue(undefined);

let mockDataSourceInstances: any[] = [];

jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    DataSource: jest.fn().mockImplementation((opts) => {
      const instance = {
        isInitialized: true,
        initialize: mockInitialize.mockImplementation(function () {
          instance.isInitialized = true;
          return Promise.resolve(instance);
        }),
        destroy: mockDestroy.mockImplementation(function () {
          instance.isInitialized = false;
          return Promise.resolve();
        }),
        options: opts,
        getRepository: jest.fn(),
      };
      mockDataSourceInstances.push(instance);
      return instance;
    }),
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ACTIVE = {
  id: 'tenant-1',
  name: 'Test Tenant',
  slug: 'test-tenant',
  status: TenantStatus.ACTIVE,
  dbName: 'tenant_test_tenant',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

const TENANT_SUSPENDED = {
  ...TENANT_ACTIVE,
  id: 'tenant-2',
  slug: 'suspended-tenant',
  status: TenantStatus.SUSPENDED,
  dbName: 'tenant_suspended',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeControlPlaneDsMock(tenantResult: any = TENANT_ACTIVE) {
  return {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(tenantResult),
    }),
  };
}

function makeRequest(tenantId: string | null = 'test-tenant') {
  return { tenantId };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TenantConnectionService', () => {
  let service: TenantConnectionService;
  let controlPlaneDsMock: ReturnType<typeof makeControlPlaneDsMock>;
  let request: ReturnType<typeof makeRequest>;

  beforeEach(async () => {
    // Drain pool to ensure clean state between tests
    await drainTenantPool();
    mockDataSourceInstances = [];
    jest.clearAllMocks();

    controlPlaneDsMock = makeControlPlaneDsMock();
    request = makeRequest();

    service = new TenantConnectionService(
      request as any,
      controlPlaneDsMock as any,
    );
  });

  afterEach(async () => {
    await drainTenantPool();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getTenantConnection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getTenantConnection', () => {
    it('should create a new DataSource for a valid ACTIVE tenant', async () => {
      const ds = await service.getTenantConnection();

      expect(ds).toBeDefined();
      expect(ds.isInitialized).toBe(true);
      expect(mockInitialize).toHaveBeenCalled();
      expect(controlPlaneDsMock.getRepository).toHaveBeenCalled();
    });

    it('should return cached DataSource on second call (pool hit)', async () => {
      const first = await service.getTenantConnection();
      mockInitialize.mockClear();
      controlPlaneDsMock.getRepository.mockClear();

      const second = await service.getTenantConnection();

      expect(second).toBe(first);
      expect(mockInitialize).not.toHaveBeenCalled();
      // should not query control plane again
      expect(controlPlaneDsMock.getRepository).not.toHaveBeenCalled();
    });

    it('should throw if tenant slug is null or missing', async () => {
      service = new TenantConnectionService(
        { tenantId: null } as any,
        controlPlaneDsMock as any,
      );

      await expect(service.getTenantConnection())
        .rejects.toThrow('Tenant slug is required');
    });

    it('should throw if tenant not found in control plane', async () => {
      controlPlaneDsMock = makeControlPlaneDsMock(null);
      service = new TenantConnectionService(request as any, controlPlaneDsMock as any);

      await expect(service.getTenantConnection())
        .rejects.toThrow("Tenant 'test-tenant' not found");
    });

    it('should throw if tenant is SUSPENDED', async () => {
      controlPlaneDsMock = makeControlPlaneDsMock(TENANT_SUSPENDED);
      service = new TenantConnectionService(request as any, controlPlaneDsMock as any);

      await expect(service.getTenantConnection())
        .rejects.toThrow('Access denied');
    });

    it('should throw if tenant is ARCHIVED', async () => {
      const archived = { ...TENANT_ACTIVE, status: TenantStatus.ARCHIVED };
      controlPlaneDsMock = makeControlPlaneDsMock(archived);
      service = new TenantConnectionService(request as any, controlPlaneDsMock as any);

      await expect(service.getTenantConnection())
        .rejects.toThrow('Access denied');
    });

    it('should re-create connection if cached DataSource is no longer initialized', async () => {
      const first = await service.getTenantConnection();
      // Simulate destroyed connection
      (first as any).isInitialized = false;

      const second = await service.getTenantConnection();

      expect(second).not.toBe(first);
      expect(mockInitialize).toHaveBeenCalledTimes(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getCurrentTenantDateWindow
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getCurrentTenantDateWindow', () => {
    it('should return startDate and endDate from tenant', async () => {
      const result = await service.getCurrentTenantDateWindow();

      expect(result).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
    });

    it('should return null dates when tenant has no dates', async () => {
      const noDatesTenant = { ...TENANT_ACTIVE, startDate: null, endDate: null };
      controlPlaneDsMock = makeControlPlaneDsMock(noDatesTenant);
      service = new TenantConnectionService(request as any, controlPlaneDsMock as any);

      const result = await service.getCurrentTenantDateWindow();

      expect(result).toEqual({ startDate: null, endDate: null });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAppPlaneDataSourceBySlug (exported helper)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAppPlaneDataSourceBySlug', () => {
    it('should create and return a DataSource for a valid slug', async () => {
      const ds = await getAppPlaneDataSourceBySlug('test-tenant', controlPlaneDsMock as any);

      expect(ds).toBeDefined();
      expect(ds.isInitialized).toBe(true);
    });

    it('should return cached DataSource on subsequent calls', async () => {
      const first = await getAppPlaneDataSourceBySlug('test-tenant', controlPlaneDsMock as any);
      mockInitialize.mockClear();

      const second = await getAppPlaneDataSourceBySlug('test-tenant', controlPlaneDsMock as any);

      expect(second).toBe(first);
      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('should throw if tenant slug not found', async () => {
      const emptyDs = makeControlPlaneDsMock(null);

      await expect(getAppPlaneDataSourceBySlug('nonexistent', emptyDs as any))
        .rejects.toThrow("Tenant 'nonexistent' not found");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // drainTenantPool
  // ═══════════════════════════════════════════════════════════════════════════

  describe('drainTenantPool', () => {
    it('should destroy all initialized connections and clear the pool', async () => {
      // Populate pool
      await service.getTenantConnection();

      await drainTenantPool();

      // After drain, getting connection should require re-initialization
      mockInitialize.mockClear();
      controlPlaneDsMock = makeControlPlaneDsMock();
      service = new TenantConnectionService(request as any, controlPlaneDsMock as any);

      await service.getTenantConnection();
      expect(mockInitialize).toHaveBeenCalled();
    });
  });
});
