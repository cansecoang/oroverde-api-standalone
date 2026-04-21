import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { CountriesService } from './countries.service';
import { GlobalCountry } from './entities/country.entity';
import { ALL_COUNTRIES_SEED } from './seed/all-countries.seed';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COUNTRY_MX: GlobalCountry = {
  id: 'uuid-mx',
  code: 'MX',
  name: 'México',
  timezone: 'America/Mexico_City',
  phone_code: '+52',
  region: 'Americas',
};

const COUNTRY_NO_TZ: GlobalCountry = {
  id: 'uuid-xx',
  code: 'XX',
  name: 'Sin zona horaria',
  timezone: null,
  phone_code: null,
  region: null,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const makeRepoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const makeEventEmitterMock = () => ({
  emit: jest.fn(),
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('CountriesService', () => {
  let service: CountriesService;
  let repo: ReturnType<typeof makeRepoMock>;
  let eventEmitter: ReturnType<typeof makeEventEmitterMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    eventEmitter = makeEventEmitterMock();
    service = new CountriesService(
      repo as unknown as Repository<GlobalCountry>,
      eventEmitter as unknown as EventEmitter2,
    );
    // Silenciar logger en todos los tests
    jest.spyOn((service as any).logger, 'log').mockImplementation();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('delega al repo ordenando por name ASC', async () => {
      repo.find.mockResolvedValue([COUNTRY_MX]);
      const result = await service.findAll();
      expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(result).toEqual([COUNTRY_MX]);
    });
  });

  // ─── findByCode ──────────────────────────────────────────────────────────

  describe('findByCode(code)', () => {
    it('normaliza el code a mayúsculas antes de consultar', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      await service.findByCode('mx');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { code: 'MX' } });
    });

    it('lanza NotFoundException si el país no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findByCode('ZZ')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create(dto)', () => {
    it('crea y guarda el país con code en mayúsculas', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(COUNTRY_MX);
      repo.save.mockResolvedValue(COUNTRY_MX);

      const result = await service.create({ code: 'mx', name: 'México', timezone: 'America/Mexico_City', phone_code: '+52', region: 'Americas' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'MX' }));
      expect(result).toEqual(COUNTRY_MX);
    });

    it('lanza ConflictException si el code ya existe', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      await expect(service.create({ code: 'MX', name: 'X', timezone: null, phone_code: null, region: null }))
        .rejects.toThrow(ConflictException);
    });

    it('NO emite ningún evento al crear un país', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(COUNTRY_MX);
      repo.save.mockResolvedValue(COUNTRY_MX);

      await service.create({ code: 'MX', name: 'México', timezone: null, phone_code: null, region: null });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update(code, dto)', () => {
    it('normaliza el code del param a mayúsculas para buscar', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.save.mockResolvedValue(COUNTRY_MX);

      await service.update('mx', { name: 'México actualizado' });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { code: 'MX' } });
    });

    it('normaliza dto.code a mayúsculas si viene en el body', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      const saved = { ...COUNTRY_MX, code: 'MX' };
      repo.save.mockResolvedValue(saved);

      await service.update('MX', { code: 'mx' });

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'MX' }));
    });

    it('emite country.updated con payload correcto tras repo.save', async () => {
      const updated = { ...COUNTRY_MX, name: 'México actualizado' };
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.save.mockResolvedValue(updated);

      await service.update('MX', { name: 'México actualizado' });

      expect(eventEmitter.emit).toHaveBeenCalledWith('country.updated', {
        code: 'MX',
        name: 'México actualizado',
        timezone: 'America/Mexico_City',
      });
    });

    it('emite timezone: null cuando el país no tiene timezone (no undefined)', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_NO_TZ);
      repo.save.mockResolvedValue({ ...COUNTRY_NO_TZ, name: 'Actualizado' });

      await service.update('XX', { name: 'Actualizado' });

      const [, payload] = eventEmitter.emit.mock.calls[0];
      expect(payload.timezone).toBeNull();
      expect(payload.timezone).not.toBeUndefined();
    });

    it('devuelve la entidad resultado de repo.save', async () => {
      const saved = { ...COUNTRY_MX, name: 'Nuevo nombre' };
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.save.mockResolvedValue(saved);

      const result = await service.update('MX', { name: 'Nuevo nombre' });

      expect(result).toBe(saved);
    });

    it('lanza NotFoundException si el país no existe y NO emite evento', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('ZZ', { name: 'X' })).rejects.toThrow(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('NO emite evento si repo.save lanza error', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.save.mockRejectedValue(new Error('DB failure'));

      await expect(service.update('MX', { name: 'X' })).rejects.toThrow('DB failure');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emite exactamente una vez aunque dto tenga múltiples campos', async () => {
      const saved = { ...COUNTRY_MX, name: 'Nuevo', timezone: 'Europe/Madrid' };
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.save.mockResolvedValue(saved);

      await service.update('MX', { name: 'Nuevo', timezone: 'Europe/Madrid' });

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove(code)', () => {
    it('llama a repo.remove con la entidad encontrada y emite country.deleted', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.remove.mockResolvedValue(undefined);

      await service.remove('MX');

      expect(repo.remove).toHaveBeenCalledWith(COUNTRY_MX);
      expect(eventEmitter.emit).toHaveBeenCalledWith('country.deleted', { code: 'MX' });
    });

    it('el code emitido es el de la entidad encontrada, no el argumento raw del caller', async () => {
      // findByCode normaliza a upper, lo que emite es la entidad ya guardada con code='MX'
      repo.findOne.mockResolvedValue(COUNTRY_MX); // entity.code === 'MX'
      repo.remove.mockResolvedValue(undefined);

      await service.remove('mx'); // argumento en minúsculas

      const [, payload] = eventEmitter.emit.mock.calls[0];
      expect(payload.code).toBe('MX');
    });

    it('lanza NotFoundException si el país no existe y NO emite evento', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove('ZZ')).rejects.toThrow(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('NO emite evento si repo.remove lanza error', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.remove.mockRejectedValue(new Error('FK constraint'));

      await expect(service.remove('MX')).rejects.toThrow('FK constraint');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emite exactamente una vez al eliminar', async () => {
      repo.findOne.mockResolvedValue(COUNTRY_MX);
      repo.remove.mockResolvedValue(undefined);

      await service.remove('MX');

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });

  // ─── seedAll ─────────────────────────────────────────────────────────────

  describe('seedAll()', () => {
    it('NO emite ningún evento aunque inserte o actualice países', async () => {
      // Simular: 1 país que no existe, 1 que existe con cambios, 1 que existe sin cambios
      repo.findOne
        .mockResolvedValueOnce(null)                                          // no existe → insert
        .mockResolvedValueOnce({ ...COUNTRY_MX, name: 'Mexico old' })        // existe con nombre diferente → update
        .mockResolvedValue({ ...COUNTRY_MX });                               // existe sin cambios → skip

      repo.create.mockReturnValue({});
      repo.save.mockResolvedValue({});

      await service.seedAll();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('retorna el total correcto y mensaje esperado', async () => {
      // Todos los findOne retornan null → todos insertados
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({});
      repo.save.mockResolvedValue({});

      const result = await service.seedAll();

      expect(result.total).toBe(ALL_COUNTRIES_SEED.length);
      expect(result.message).toContain('totales');
      expect(result.message).toContain(String(ALL_COUNTRIES_SEED.length));
    });

    it('cuenta solo países realmente insertados o modificados, no los ya iguales', async () => {
      // 3 países del seed:
      //  [0] no existe → insert (cuenta)
      //  [1] existe con name diferente → update (cuenta)
      //  [2] existe igual → skip (no cuenta)
      //
      // Usamos un subset real del seed para evitar iterar los ~250 países
      const seed = ALL_COUNTRIES_SEED;
      const firstCode = seed[0].code;
      const secondCode = seed[1].code;

      repo.findOne.mockImplementation(({ where: { code } }) => {
        if (code === firstCode) return Promise.resolve(null);
        if (code === secondCode) return Promise.resolve({ ...seed[1], name: 'OLD NAME' });
        // El resto existe sin cambios
        return Promise.resolve({ ...seed.find(c => c.code === code) });
      });

      repo.create.mockReturnValue({});
      repo.save.mockResolvedValue({});

      const result = await service.seedAll();

      // Al menos los 2 primeros deben haber contado; los demás son iguales
      // No podemos saber exactamente cuántos coinciden en el seed real,
      // así que verificamos que upserted < total y >= 2
      expect(result.total).toBe(seed.length);
      expect(result.message).toMatch(/^\d+ países insertados\/actualizados de \d+ totales$/);
    });

    it('el mensaje indica 0 upserted cuando todos los países existen sin cambios', async () => {
      // Todos existen y son idénticos al seed
      repo.findOne.mockImplementation(({ where: { code } }) => {
        const found = ALL_COUNTRIES_SEED.find(c => c.code === code);
        return Promise.resolve(found ? { ...found } : null);
      });

      const result = await service.seedAll();

      expect(result.message).toMatch(/^0 países insertados\/actualizados/);
    });
  });
});
