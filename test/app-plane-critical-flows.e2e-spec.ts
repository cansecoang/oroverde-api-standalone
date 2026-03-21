import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { App } from 'supertest/types';

import { AllExceptionsFilter } from '../src/app/common/filters/all-exceptions.filter';
import { AuthenticatedGuard } from '../src/app/common/guards/authenticated.guard';
import { TenantAccessGuard } from '../src/app/common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../src/app/common/guards/hybrid-permissions.guard';

import { TasksController } from '../src/app/modules/app-plane/tasks/tasks.controller';
import { TasksService } from '../src/app/modules/app-plane/tasks/tasks.service';

import { ProjectCheckInsController } from '../src/app/modules/app-plane/products/project-checkins.controller';
import { ProjectCheckInsService } from '../src/app/modules/app-plane/products/project-checkins.service';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const CHECKIN_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZER_ID = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_MEMBER_ID = '55555555-5555-4555-8555-555555555555';

const tasksServiceMock = {
  create: jest.fn(),
  updateStatus: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findByProject: jest.fn(),
};

const checkinsServiceMock = {
  findByProduct: jest.fn(),
  getMyUpcomingCheckins: jest.fn(),
  findOne: jest.fn(),
  schedule: jest.fn(),
  update: jest.fn(),
  complete: jest.fn(),
  remove: jest.fn(),
};

const authenticatedGuardMock = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();
    req.workspaceMember = {
      id: WORKSPACE_MEMBER_ID,
      tenantRole: 'general_coordinator',
    };
    return true;
  },
};

const allowGuardMock = { canActivate: () => true };

@Module({
  controllers: [TasksController, ProjectCheckInsController],
  providers: [
    { provide: TasksService, useValue: tasksServiceMock },
    { provide: ProjectCheckInsService, useValue: checkinsServiceMock },
  ],
})
class TestAppPlaneModule {}

describe('App-plane Critical Flows (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const testingModuleBuilder = Test.createTestingModule({
      imports: [TestAppPlaneModule],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue(authenticatedGuardMock)
      .overrideGuard(TenantAccessGuard)
      .useValue(allowGuardMock)
      .overrideGuard(HybridPermissionsGuard)
      .useValue(allowGuardMock);

    const moduleFixture: TestingModule = await testingModuleBuilder.compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    tasksServiceMock.create.mockResolvedValue({
      id: TASK_ID,
      title: 'Nueva tarea',
      productId: PRODUCT_ID,
    });

    checkinsServiceMock.schedule.mockResolvedValue({
      id: CHECKIN_ID,
      title: 'Revisión semanal',
      productId: PRODUCT_ID,
    });
  });

  it('POST /tasks crea una tarea y propaga actor context', async () => {
    const payload = {
      title: 'Nueva tarea',
      productId: PRODUCT_ID,
      assigneeMemberId: ORGANIZER_ID,
    };

    const response = await request(app.getHttpServer())
      .post('/tasks')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: TASK_ID,
        title: 'Nueva tarea',
        productId: PRODUCT_ID,
      }),
    );

    expect(tasksServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      {
        workspaceMemberId: WORKSPACE_MEMBER_ID,
        tenantRole: 'general_coordinator',
      },
    );
  });

  it('POST /tasks transforma QueryFailedError 42703 en respuesta 500 con diagnóstico', async () => {
    tasksServiceMock.create.mockRejectedValue(
      new QueryFailedError('SELECT DISTINCT distinctAlias.Product_id FROM products', [], {
        code: '42703',
        message: 'column distinctAlias.Product_id does not exist',
        table: 'products',
        column: 'Product_id',
        hint: 'Perhaps you meant to reference the column "product_id".',
        position: '39',
        query: 'SELECT DISTINCT distinctAlias.Product_id FROM products product',
        stack: 'stack-trace',
      } as any),
    );

    const response = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        title: 'Tarea con error',
        productId: PRODUCT_ID,
      })
      .expect(500);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 500,
        error: 'Database Error',
        message: 'Columna no encontrada en la base de datos',
        details: expect.objectContaining({
          code: '42703',
          table: 'products',
          column: 'Product_id',
          queryFragment: expect.stringContaining('SELECT DISTINCT'),
        }),
      }),
    );
  });

  it('GET /checkins/product/:productId propaga paginación numérica al servicio', async () => {
    checkinsServiceMock.findByProduct.mockResolvedValue({
      nextCheckin: null,
      upcoming: [],
      past: [],
      pastTotal: 0,
      pastPage: 2,
      pastLimit: 15,
    });

    await request(app.getHttpServer())
      .get(`/checkins/product/${PRODUCT_ID}?pastPage=2&pastLimit=15`)
      .expect(200);

    expect(checkinsServiceMock.findByProduct).toHaveBeenCalledWith(PRODUCT_ID, 2, 15);
  });

  it('POST /checkins programa checkin y propaga actor context', async () => {
    const payload = {
      title: 'Revisión semanal',
      scheduled_at: '2026-03-20T15:00:00.000Z',
      productId: PRODUCT_ID,
      organizerId: ORGANIZER_ID,
      attendeeIds: [WORKSPACE_MEMBER_ID],
    };

    const response = await request(app.getHttpServer())
      .post('/checkins')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: CHECKIN_ID,
        title: 'Revisión semanal',
        productId: PRODUCT_ID,
      }),
    );

    expect(checkinsServiceMock.schedule).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      {
        workspaceMemberId: WORKSPACE_MEMBER_ID,
        tenantRole: 'general_coordinator',
      },
    );
  });

  it('POST /checkins valida payload y retorna 400 si organizerId no es UUID', async () => {
    await request(app.getHttpServer())
      .post('/checkins')
      .send({
        title: 'Checkin inválido',
        scheduled_at: '2026-03-20T15:00:00.000Z',
        productId: PRODUCT_ID,
        organizerId: 'not-a-uuid',
      })
      .expect(400);

    expect(checkinsServiceMock.schedule).not.toHaveBeenCalled();
  });
});
