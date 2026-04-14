// IMPORTANTE: jest.mock debe ir antes de cualquier import del código de producción
// para interceptar la construcción de pg.Client en executeOnTenantDb.
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockQuery = jest.fn();
const MockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  query: mockQuery,
  end: mockEnd,
}));

jest.mock('pg', () => ({ Client: MockClient }));

import { Repository } from 'typeorm';
import { TenantSyncListener } from './tenant-sync.listener';
import { Tenant } from './tenants/entities/tenant.entity';
import { TenantMember } from './tenants/entities/tenant-member.entity';
import { TenantStatus } from '../../common/enums/tenant-status.enum';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T_ALFA: Pick<Tenant, 'id' | 'dbName' | 'slug' | 'status'> = {
  id: 'tid-1',
  dbName: 'tenant_alfa',
  slug: 'alfa',
  status: TenantStatus.ACTIVE,
};

const T_BETA: Pick<Tenant, 'id' | 'dbName' | 'slug' | 'status'> = {
  id: 'tid-2',
  dbName: 'tenant_beta',
  slug: 'beta',
  status: TenantStatus.ACTIVE,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** rowCount para un pg.query result */
const pgResult = (rowCount: number) => Promise.resolve({ rowCount });
/** pg.query result con rowCount null (edge case de pg) */
const pgResultNull = () => Promise.resolve({ rowCount: null });

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TenantSyncListener — handleCountryUpdated / handleCountryDeleted', () => {
  let listener: TenantSyncListener;
  let tenantRepo: { find: jest.Mock };
  let tenantMemberRepo: { createQueryBuilder: jest.Mock };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    tenantRepo = { find: jest.fn() };
    tenantMemberRepo = { createQueryBuilder: jest.fn() };

    listener = new TenantSyncListener(
      tenantRepo as unknown as Repository<Tenant>,
      tenantMemberRepo as unknown as Repository<TenantMember>,
    );

    logSpy   = jest.spyOn((listener as any).logger, 'log').mockImplementation();
    warnSpy  = jest.spyOn((listener as any).logger, 'warn').mockImplementation();
    errorSpy = jest.spyOn((listener as any).logger, 'error').mockImplementation();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // handleCountryUpdated
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handleCountryUpdated(payload)', () => {
    const PAYLOAD = { code: 'MX', name: 'México', timezone: 'America/Mexico_City' };

    it('consulta solo tenants con status ACTIVE', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryUpdated(PAYLOAD);

      expect(tenantRepo.find).toHaveBeenCalledWith({
        where: { status: TenantStatus.ACTIVE },
        select: ['id', 'dbName', 'slug'],
      });
    });

    it('ejecuta UPDATE countries con los parámetros correctos en cada silo', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA, T_BETA]);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryUpdated(PAYLOAD);

      // Se crea un pg.Client por tenant
      expect(MockClient).toHaveBeenCalledTimes(2);

      // Cada instancia ejecuta el UPDATE correcto
      const instances = MockClient.mock.results.map(r => r.value);
      for (const instance of instances) {
        expect(instance.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE countries SET name = $1, timezone = $2 WHERE id = $3'),
          [PAYLOAD.name, PAYLOAD.timezone, PAYLOAD.code],
        );
      }
    });

    it('conecta y cierra cada pg.Client (connect + end siempre)', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryUpdated(PAYLOAD);

      const instance = MockClient.mock.results[0].value;
      expect(instance.connect).toHaveBeenCalledTimes(1);
      expect(instance.end).toHaveBeenCalledTimes(1);
    });

    it('es silencioso cuando UPDATE devuelve 0 rows (tenant no tiene ese país)', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockResolvedValue({ rowCount: 0 });

      await listener.handleCountryUpdated(PAYLOAD);

      // No debe haber warning ni error — solo el log resumen
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('trata rowCount: null como 0 (silencioso)', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockReturnValue(pgResultNull());

      await listener.handleCountryUpdated(PAYLOAD);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('continúa con el siguiente tenant si uno falla (no aborta el loop)', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA, T_BETA]);
      // Primer tenant: connect lanza error. Segundo: rowCount 1.
      mockConnect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryUpdated(PAYLOAD);

      // Instanciado 2 veces — el error del primero no detiene el loop
      expect(MockClient).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('alfa'));
    });

    it('cierra pg.Client en finally aunque query lance error', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockRejectedValue(new Error('query timeout'));

      await listener.handleCountryUpdated(PAYLOAD);

      const instance = MockClient.mock.results[0].value;
      expect(instance.end).toHaveBeenCalledTimes(1);
    });

    it('no crea ningún pg.Client si no hay tenants activos', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryUpdated(PAYLOAD);

      expect(MockClient).not.toHaveBeenCalled();
    });

    it('timezone: null se pasa como null al query, no como string "null"', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryUpdated({ code: 'MX', name: 'México', timezone: null });

      const instance = MockClient.mock.results[0].value;
      const [, params] = instance.query.mock.calls[0];
      expect(params[1]).toBeNull();
      expect(params[1]).not.toBe('null');
    });

    it('no llama createQueryBuilder (solo tenantRepo.find)', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryUpdated(PAYLOAD);

      expect(tenantMemberRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // handleCountryDeleted
  // ═══════════════════════════════════════════════════════════════════════════

  describe('handleCountryDeleted(payload)', () => {
    const PAYLOAD = { code: 'MX' };

    it('consulta solo tenants con status ACTIVE', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryDeleted(PAYLOAD);

      expect(tenantRepo.find).toHaveBeenCalledWith({
        where: { status: TenantStatus.ACTIVE },
        select: ['id', 'dbName', 'slug'],
      });
    });

    it('el SQL de DELETE incluye la subquery de exclusión por FK de products', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryDeleted(PAYLOAD);

      const instance = MockClient.mock.results[0].value;
      const [sql] = instance.query.mock.calls[0];
      expect(sql).toContain('DELETE FROM countries');
      expect(sql).toContain('id NOT IN');
      expect(sql).toContain('SELECT country_id FROM products');
      expect(sql).toContain('country_id IS NOT NULL');
    });

    it('cuando DELETE retorna > 0, registra éxito y NO hace SELECT de comprobación', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryDeleted(PAYLOAD);

      const instance = MockClient.mock.results[0].value;
      // Solo una query (el DELETE), no el SELECT de comprobación
      expect(instance.query).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('cuando DELETE=0 y SELECT=1 → logger.warn "bloqueado por productos"', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      // Primera llamada: DELETE → 0 rows. Segunda: SELECT → 1 row (existe, bloqueado)
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await listener.handleCountryDeleted(PAYLOAD);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bloqueado'));
    });

    it('cuando DELETE=0 y SELECT=0 → silencioso (tenant no tenía ese país)', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      await listener.handleCountryDeleted(PAYLOAD);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('escenario mixto: un silo elimina, uno bloqueado, uno sin el país', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA, T_BETA, { id: 'tid-3', dbName: 'tenant_gamma', slug: 'gamma', status: TenantStatus.ACTIVE }]);

      // alfa: DELETE → 1 (éxito)
      // beta: DELETE → 0, SELECT → 1 (bloqueado)
      // gamma: DELETE → 0, SELECT → 0 (no tenía el país)
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // alfa DELETE
        .mockResolvedValueOnce({ rowCount: 0 }) // beta DELETE
        .mockResolvedValueOnce({ rowCount: 1 }) // beta SELECT (bloqueado)
        .mockResolvedValueOnce({ rowCount: 0 }) // gamma DELETE
        .mockResolvedValueOnce({ rowCount: 0 }); // gamma SELECT (no existía)

      await listener.handleCountryDeleted(PAYLOAD);

      // Solo beta genera warning
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('beta'));
      // El log de alfa confirma éxito
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alfa'));
      // No hay errores
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('continúa con el siguiente tenant si uno falla', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA, T_BETA]);
      mockConnect
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await listener.handleCountryDeleted(PAYLOAD);

      expect(MockClient).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('alfa'));
    });

    it('cierra pg.Client en finally aunque DELETE lance error', async () => {
      tenantRepo.find.mockResolvedValue([T_ALFA]);
      mockConnect.mockResolvedValue(undefined);
      mockQuery.mockRejectedValue(new Error('DB error'));

      await listener.handleCountryDeleted(PAYLOAD);

      const instance = MockClient.mock.results[0].value;
      expect(instance.end).toHaveBeenCalledTimes(1);
    });

    it('no crea ningún pg.Client si no hay tenants activos', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryDeleted(PAYLOAD);

      expect(MockClient).not.toHaveBeenCalled();
    });

    it('no llama createQueryBuilder (solo tenantRepo.find)', async () => {
      tenantRepo.find.mockResolvedValue([]);

      await listener.handleCountryDeleted(PAYLOAD);

      expect(tenantMemberRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
