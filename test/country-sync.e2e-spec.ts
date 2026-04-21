import {
  ExecutionContext,
  INestApplication,
  Module,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import request from 'supertest';
import { App } from 'supertest/types';

import { AllExceptionsFilter } from '../src/app/common/filters/all-exceptions.filter';
import { AuthenticatedGuard } from '../src/app/common/guards/authenticated.guard';
import { RolesGuard } from '../src/app/common/guards/roles.guard';

import { CountriesController } from '../src/app/modules/control-plane/countries/countries.controller';
import { CountriesService } from '../src/app/modules/control-plane/countries/countries.service';
import { TenantSyncListener } from '../src/app/modules/control-plane/tenant-sync.listener';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COUNTRY_MX = {
  id: 'uuid-mx',
  code: 'MX',
  name: 'México',
  timezone: 'America/Mexico_City',
  phone_code: '+52',
  region: 'Americas',
};

// ─── Guard mocks ─────────────────────────────────────────────────────────────

const authenticatedGuardMock = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 'super-admin-uuid', globalRole: 'super_admin' };
    return true;
  },
};

const allowGuardMock = { canActivate: () => true };

// ═══════════════════════════════════════════════════════════════════════════════
// BLOQUE 1: Contrato HTTP — PUT / DELETE / POST seed
// Mock completo de CountriesService; sin EventEmitter real.
// ═══════════════════════════════════════════════════════════════════════════════

const countriesServiceMock = {
  findAll: jest.fn(),
  findByCode: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  seedAll: jest.fn(),
};

@Module({
  controllers: [CountriesController],
  providers: [{ provide: CountriesService, useValue: countriesServiceMock }],
})
class TestCountriesHttpModule {}

describe('Countries — Contrato HTTP (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestCountriesHttpModule],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue(authenticatedGuardMock)
      .overrideGuard(RolesGuard)
      .useValue(allowGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });
  beforeEach(() => jest.clearAllMocks());

  // ─── PUT /admin/countries/:code ──────────────────────────────────────────

  describe('PUT /admin/countries/:code', () => {
    it('devuelve 200 con los datos actualizados', async () => {
      const updated = { ...COUNTRY_MX, name: 'México actualizado' };
      countriesServiceMock.update.mockResolvedValue(updated);

      const response = await request(app.getHttpServer())
        .put('/admin/countries/MX')
        .send({ name: 'México actualizado' })
        .expect(200);

      expect(response.body).toEqual(expect.objectContaining({
        code: 'MX',
        name: 'México actualizado',
      }));
    });

    it('pasa el code del param (no del body) al servicio', async () => {
      countriesServiceMock.update.mockResolvedValue(COUNTRY_MX);

      await request(app.getHttpServer())
        .put('/admin/countries/MX')
        .send({ name: 'Test' })
        .expect(200);

      expect(countriesServiceMock.update).toHaveBeenCalledWith('MX', expect.objectContaining({ name: 'Test' }));
    });

    it('devuelve 404 cuando el servicio lanza NotFoundException', async () => {
      countriesServiceMock.update.mockRejectedValue(new NotFoundException("País con código 'ZZ' no encontrado"));

      const response = await request(app.getHttpServer())
        .put('/admin/countries/ZZ')
        .send({ name: 'Test' })
        .expect(404);

      expect(response.body.message).toContain('ZZ');
    });

    it('devuelve 400 si dto.code tiene más o menos de 2 caracteres', async () => {
      await request(app.getHttpServer())
        .put('/admin/countries/MX')
        .send({ code: 'MEX' }) // 3 chars — debe fallar @Length(2,2)
        .expect(400);

      expect(countriesServiceMock.update).not.toHaveBeenCalled();
    });

    it('permite body vacío (todos los campos son opcionales en UpdateDto)', async () => {
      countriesServiceMock.update.mockResolvedValue(COUNTRY_MX);

      await request(app.getHttpServer())
        .put('/admin/countries/MX')
        .send({})
        .expect(200);
    });

    it('rechaza campos desconocidos gracias a ValidationPipe whitelist', async () => {
      countriesServiceMock.update.mockResolvedValue(COUNTRY_MX);

      await request(app.getHttpServer())
        .put('/admin/countries/MX')
        .send({ name: 'Test', unknownField: 'x' })
        .expect(200);

      // El campo desconocido es eliminado — el servicio solo recibe campos del DTO
      const [, dto] = countriesServiceMock.update.mock.calls[0];
      expect(dto).not.toHaveProperty('unknownField');
    });
  });

  // ─── DELETE /admin/countries/:code ──────────────────────────────────────

  describe('DELETE /admin/countries/:code', () => {
    it('devuelve 200 al eliminar exitosamente', async () => {
      countriesServiceMock.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/admin/countries/MX')
        .expect(200);
    });

    it('pasa el code del param al servicio', async () => {
      countriesServiceMock.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/admin/countries/DE')
        .expect(200);

      expect(countriesServiceMock.remove).toHaveBeenCalledWith('DE');
    });

    it('devuelve 404 cuando el servicio lanza NotFoundException', async () => {
      countriesServiceMock.remove.mockRejectedValue(new NotFoundException("País con código 'ZZ' no encontrado"));

      await request(app.getHttpServer())
        .delete('/admin/countries/ZZ')
        .expect(404);
    });
  });

  // ─── POST /admin/countries/seed ─────────────────────────────────────────

  describe('POST /admin/countries/seed', () => {
    it('devuelve el resultado de seedAll()', async () => {
      countriesServiceMock.seedAll.mockResolvedValue({
        total: 249,
        message: '3 países insertados/actualizados de 249 totales',
      });

      const response = await request(app.getHttpServer())
        .post('/admin/countries/seed')
        .expect(201);

      expect(response.body).toEqual({
        total: 249,
        message: expect.stringContaining('249 totales'),
      });
    });
  });

  // ─── POST /admin/countries (create) ─────────────────────────────────────

  describe('POST /admin/countries', () => {
    it('devuelve 400 si code no tiene exactamente 2 caracteres', async () => {
      await request(app.getHttpServer())
        .post('/admin/countries')
        .send({ code: 'MEX', name: 'México' })
        .expect(400);

      expect(countriesServiceMock.create).not.toHaveBeenCalled();
    });

    it('devuelve 400 si name está ausente', async () => {
      await request(app.getHttpServer())
        .post('/admin/countries')
        .send({ code: 'MX' })
        .expect(400);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOQUE 2: Propagación de eventos — service → EventEmitter → listener
// Usa CountriesService real (con repo mockeado) + EventEmitterModule real
// + TenantSyncListener real (con tenantRepo mockeado, pg.Client nunca llamado
// porque espiamos handleCountryUpdated / handleCountryDeleted antes de que ejecuten).
// ═══════════════════════════════════════════════════════════════════════════════

const repoMock = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

const tenantRepoMock = { find: jest.fn() };
const tenantMemberRepoMock = { createQueryBuilder: jest.fn() };

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [CountriesController],
  providers: [
    CountriesService,
    TenantSyncListener,
    { provide: 'GlobalCountryRepository', useValue: repoMock },
    { provide: 'TenantRepository', useValue: tenantRepoMock },
    { provide: 'TenantMemberRepository', useValue: tenantMemberRepoMock },
  ],
})
class TestCountriesEventModule {}

describe('Countries — Propagación de eventos (e2e)', () => {
  let app: INestApplication<App>;
  let listener: TenantSyncListener;
  let updatedSpy: jest.SpyInstance;
  let deletedSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [CountriesController],
      providers: [
        CountriesService,
        TenantSyncListener,
        // TypeORM @InjectRepository(GlobalCountry, 'default') → token interno de NestJS
        // Se resuelve usando el token string que genera getRepositoryToken()
        {
          provide: require('@nestjs/typeorm').getRepositoryToken(
            require('../src/app/modules/control-plane/countries/entities/country.entity').GlobalCountry,
            'default',
          ),
          useValue: repoMock,
        },
        {
          provide: require('@nestjs/typeorm').getRepositoryToken(
            require('../src/app/modules/control-plane/tenants/entities/tenant.entity').Tenant,
            'default',
          ),
          useValue: tenantRepoMock,
        },
        {
          provide: require('@nestjs/typeorm').getRepositoryToken(
            require('../src/app/modules/control-plane/tenants/entities/tenant-member.entity').TenantMember,
            'default',
          ),
          useValue: tenantMemberRepoMock,
        },
      ],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue(authenticatedGuardMock)
      .overrideGuard(RolesGuard)
      .useValue(allowGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    listener = moduleFixture.get(TenantSyncListener);

    // Espiar los handlers ANTES de que reciban eventos — así no llegan a pg.Client
    updatedSpy = jest.spyOn(listener, 'handleCountryUpdated').mockResolvedValue(undefined);
    deletedSpy = jest.spyOn(listener, 'handleCountryDeleted').mockResolvedValue(undefined);
  });

  afterAll(async () => { if (app) await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    // Restaurar los spies tras clearAllMocks para que sigan interceptando
    updatedSpy = jest.spyOn(listener, 'handleCountryUpdated').mockResolvedValue(undefined);
    deletedSpy = jest.spyOn(listener, 'handleCountryDeleted').mockResolvedValue(undefined);
  });

  /** Espera a que los handlers @OnEvent({ async: true }) se ejecuten */
  const flushEvents = () => new Promise<void>(r => setImmediate(r));

  // ─── PUT exitoso → country.updated ──────────────────────────────────────

  it('PUT exitoso → listener recibe country.updated con payload correcto', async () => {
    const saved = { ...COUNTRY_MX, name: 'México actualizado' };
    repoMock.findOne.mockResolvedValue(COUNTRY_MX);
    repoMock.save.mockResolvedValue(saved);

    await request(app.getHttpServer())
      .put('/admin/countries/MX')
      .send({ name: 'México actualizado' })
      .expect(200);

    await flushEvents();

    expect(updatedSpy).toHaveBeenCalledTimes(1);
    expect(updatedSpy).toHaveBeenCalledWith({
      code: 'MX',
      name: 'México actualizado',
      timezone: 'America/Mexico_City',
    });
    expect(deletedSpy).not.toHaveBeenCalled();
  });

  it('DELETE exitoso → listener recibe country.deleted con { code }', async () => {
    repoMock.findOne.mockResolvedValue(COUNTRY_MX);
    repoMock.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete('/admin/countries/MX')
      .expect(200);

    await flushEvents();

    expect(deletedSpy).toHaveBeenCalledTimes(1);
    expect(deletedSpy).toHaveBeenCalledWith({ code: 'MX' });
    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('PUT con NotFoundException → listener NO recibe country.updated', async () => {
    repoMock.findOne.mockResolvedValue(null); // findByCode lanza NotFoundException

    await request(app.getHttpServer())
      .put('/admin/countries/ZZ')
      .send({ name: 'Test' })
      .expect(404);

    await flushEvents();

    expect(updatedSpy).not.toHaveBeenCalled();
  });

  it('DELETE con NotFoundException → listener NO recibe country.deleted', async () => {
    repoMock.findOne.mockResolvedValue(null);

    await request(app.getHttpServer())
      .delete('/admin/countries/ZZ')
      .expect(404);

    await flushEvents();

    expect(deletedSpy).not.toHaveBeenCalled();
  });

  // ─── Regresión crítica: seedAll NO emite eventos ─────────────────────────

  it('POST /admin/countries/seed → listener NO recibe ningún evento (regresión crítica)', async () => {
    // seedAll itera el catálogo real; mockeamos findOne para simular país existente sin cambios
    repoMock.findOne.mockResolvedValue({ code: 'MX', name: 'México', timezone: 'America/Mexico_City', phone_code: '+52', region: 'Americas' });

    await request(app.getHttpServer())
      .post('/admin/countries/seed')
      .expect(201);

    await flushEvents();

    expect(updatedSpy).not.toHaveBeenCalled();
    expect(deletedSpy).not.toHaveBeenCalled();
  });
});
