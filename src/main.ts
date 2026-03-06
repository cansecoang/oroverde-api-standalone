import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';
import { doubleCsrf } from 'csrf-csrf';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // --------------------------------------------------------
  // 0. VALIDACIÓN DE VARIABLES CRÍTICAS
  // --------------------------------------------------------
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('❌ FATAL: SESSION_SECRET no está configurado o es muy corto (mín 32 chars). Revisa tu .env');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // --------------------------------------------------------
  // 1. SECURITY HEADERS (Helmet)
  // --------------------------------------------------------
  app.use(helmet());

  // --------------------------------------------------------
  // 2. CONFIGURACIÓN REDIS
  // --------------------------------------------------------
  const redisUrl = process.env.REDIS_URL || 'redis://:R3dis_S3cure_P%40ss!@localhost:6379';
  Logger.log(`🔌 Conectando a Redis...`, 'Bootstrap');

  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => Logger.error('❌ Error Redis:', err));

  // Redis DEBE conectar; si falla, la app no arranca.
  await redisClient.connect();
  Logger.log('✅ Redis conectado', 'Bootstrap');

  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'saas_sess:',
  });

  // --------------------------------------------------------
  // 2b. COOKIE PARSER (required by csrf-csrf to read req.cookies)
  // --------------------------------------------------------
  app.use(cookieParser());

  // --------------------------------------------------------
  // 3. MIDDLEWARE DE SESIÓN
  // --------------------------------------------------------
  app.use(
    session({
      store: redisStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 día
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // --------------------------------------------------------
  // 3a. CORS (must be before any raw Express routes)
  // --------------------------------------------------------
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map(o => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // --------------------------------------------------------
  // 3b. CSRF PROTECTION (M-4: double-submit cookie)
  // --------------------------------------------------------
  const csrfSecret = process.env.CSRF_SECRET || sessionSecret;
  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => csrfSecret,
    getSessionIdentifier: (req) => (req as any).sessionID ?? '',
    cookieName: '__csrf',
    cookieOptions: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    },
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
  });

  // Aplicar protección CSRF a rutas que mutan estado (POST, PUT, PATCH, DELETE)
  // Excluir: login (necesita funcionar sin CSRF previo), webhook endpoints
  app.use((req, res, next) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const csrfExemptPaths = [
      '/api/auth/login',
      '/api/auth/forgot-password',
      '/api/auth/verify-reset-code',
      '/api/auth/reset-password',
      '/api/auth/activate',
    ];
    if (safeMethods.includes(req.method) || csrfExemptPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }
    return doubleCsrfProtection(req, res, next);
  });

  // Endpoint para obtener el token CSRF (llamar después de login)
  app.getHttpAdapter().getInstance().get('/api/auth/csrf-token', (req, res) => {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
  });

  // --------------------------------------------------------
  // 5. VALIDATION PIPE (whitelist para prevenir mass assignment)
  // --------------------------------------------------------
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // --------------------------------------------------------
  // 5a. GLOBAL EXCEPTION FILTER (manejo consistente de errores)
  // --------------------------------------------------------
  const { AllExceptionsFilter } = await import('./app/common/filters/all-exceptions.filter');
  app.useGlobalFilters(new AllExceptionsFilter());

  // --------------------------------------------------------
  // 6. GRACEFUL SHUTDOWN (M-6: incluye pool de tenant DataSources)
  // --------------------------------------------------------
  app.enableShutdownHooks();

  // Importamos la referencia al pool estático del servicio de conexiones
  const { drainTenantPool } = await import('./app/modules/tenancy/tenant-connection.service');

  const cleanup = async () => {
    Logger.log('🛑 Cerrando conexiones...', 'Shutdown');
    await drainTenantPool();           // M-6: cerrar todas las conexiones de tenant
    await redisClient.disconnect();    // cerrar Redis
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // --------------------------------------------------------
  // 7. SWAGGER DOCUMENTATION
  // --------------------------------------------------------
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Product Report Multi-Tenant API')
    .setDescription(
      'API REST para gestión de proyectos/productos multi-tenant con arquitectura silo-per-tenant.\n\n' +
      '## Autenticación\n' +
      'La API utiliza **sesiones con cookies** (`connect.sid`). ' +
      'Primero haz login en `POST /api/auth/login` y el navegador/cliente recibirá la cookie automáticamente.\n\n' +
      '## Módulos\n' +
      '- **Auth** — Registro, login, logout, perfil\n' +
      '- **Admin** — Control Plane (SuperAdmin): tenants, usuarios globales, organizaciones globales\n' +
      '- **Products** — CRUD de proyectos/productos\n' +
      '- **Product Members** — Equipo de trabajo por producto\n' +
      '- **Tasks** — Tareas asignadas a productos\n' +
      '- **Check-ins** — Reuniones de seguimiento\n' +
      '- **Catalogs** — Catálogos dinámicos (fases, estados, etc.)\n' +
      '- **Field Definitions** — Campos personalizados\n' +
      '- **Members** — Miembros del workspace (tenant)\n' +
      '- **Organizations** — Organizaciones del workspace\n' +
      '- **Strategy** — Outputs, indicadores, asignación y reporte de avance',
    )
    .setVersion('1.0')
    .addCookieAuth('connect.sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'connect.sid',
      description: 'Cookie de sesión. Obtenida al hacer POST /api/auth/login',
    })
    .addTag('Auth', 'Registro, autenticación y sesión')
    .addTag('Admin - Dashboard', 'Panel de administración (SuperAdmin)')
    .addTag('Admin - Tenants', 'Gestión de tenants / workspaces (SuperAdmin)')
    .addTag('Admin - Users', 'Gestión de usuarios globales (SuperAdmin)')
    .addTag('Admin - Organizations', 'Gestión de organizaciones globales (SuperAdmin)')
    .addTag('Products', 'CRUD de proyectos / productos')
    .addTag('Product Members', 'Equipo de trabajo por producto')
    .addTag('Check-ins', 'Reuniones de seguimiento de proyecto')
    .addTag('Tasks', 'Tareas de proyecto')
    .addTag('Catalogs', 'Catálogos dinámicos')
    .addTag('Field Definitions', 'Definiciones de campos personalizados')
    .addTag('Members', 'Miembros del workspace (tenant)')
    .addTag('Organizations', 'Organizaciones del workspace')
    .addTag('Strategy', 'Gestión estratégica: outputs, indicadores, asignación y avance')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
    customSiteTitle: 'Product Report API Docs',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`📖 Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();