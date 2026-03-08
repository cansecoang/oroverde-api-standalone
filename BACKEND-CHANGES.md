# 📋 Backend Changes - Sesión Marzo 2026

## Resumen Ejecutivo

Auditoría y fixes críticos para estabilidad en producción en Azure App Service, plus implementación de endpoints de mutación para Organizations Control Plane.

---

## 1️⃣ AUDITORÍA DE "SILENT CRASH" EN AZURE APP SERVICE

### Problema Diagnosticado
El contenedor crasheaba silenciosamente a los 230 segundos sin logs de error, indicando que `NestFactory.create()` nunca resolvía y `app.listen()` nunca se alcanzaba.

### Culpables Identificados

| Severidad | Culpable | Archivo | Línea | Solución |
|-----------|----------|---------|-------|----------|
| **CRÍTICO** | TypeORM sin `connectTimeoutMS` | `src/app/app.module.ts` | 64-68 | Agregar timeout de 10s |
| **CRÍTICO** | TypeORM sin `connectTimeoutMS` (tenant) | `src/app/modules/tenancy/tenant-connection.service.ts` | 112-116 | Agregar timeout de 10s |
| **CRÍTICO** | TypeORM sin SSL en Azure | `src/app/modules/control-plane/tenants/tenants.service.ts` | 99-127, 220-252 | Forzar SSL si contiene 'azure' en host |
| **CRÍTICO** | HTTP bind a localhost (127.0.0.1) | `src/main.ts` | 354 | Bind explícito a `0.0.0.0` |
| **ALTO** | `bootstrap()` sin error handling | `src/main.ts` | 362 | Agregar `.catch()` global |
| **MEDIO** | HEALTHCHECK mata contenedor B1 | `Dockerfile.prod` | 57-58 | Eliminar, Azure lo maneja |

---

## 2️⃣ FIXES IMPLEMENTADOS (Código)

### 2.1 Control Plane - TypeORM Configuration
**Archivo:** `src/app/app.module.ts` (líneas 44-70)

```typescript
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    // ... existing config ...
    connectTimeoutMS: 10000,
    extra: {
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
    },
  }),
})
```

**Beneficio:** PostgreSQL devuelve error en 10s en lugar de cuelgarse eternamente.

---

### 2.2 Tenant Connection - TypeORM Configuration
**Archivo:** `src/app/modules/tenancy/tenant-connection.service.ts` (líneas 97-116)

```typescript
const connection = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: tenant.dbName,
  entities: TENANT_ENTITIES,
  synchronize: dbSync,
  ssl: dbSslEnabled || dbHost.includes('azure')
    ? { rejectUnauthorized: false }
    : false,
  connectTimeoutMS: 10000,
  extra: {
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  },
});
```

**Beneficio:** Las conexiones silo-per-tenant tienen timeout y fuerzan SSL si es Azure.

---

### 2.3 Tenants Service - SSL en Creación y Adición de Miembros
**Archivo:** `src/app/modules/control-plane/tenants/tenants.service.ts` (líneas 99-127, 220-252)

```typescript
const tenantDataSource = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: dbName,
  entities: [...APP_PLANE_ENTITIES],
  synchronize: true,
  ssl: dbSslEnabled || dbHost.includes('azure')
    ? { rejectUnauthorized: false }
    : false,
  connectTimeoutMS: 10000,
  extra: {
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  },
});
```

**Beneficio:** Soluciona error `no pg_hba.conf entry for host ... no encryption` en Azure PostgreSQL.

---

### 2.4 HTTP Binding & Bootstrap Error Handling
**Archivo:** `src/main.ts` (líneas 110-115, 357-362)

```typescript
// Trust proxy para Azure Load Balancer
const httpAdapter = app.getHttpAdapter();
if (httpAdapter.getType() === 'express') {
  httpAdapter.getInstance().set('trust proxy', 1);
}

// Listening con bind explícito
const port = process.env.PORT || 3000;
await app.listen(port, '0.0.0.0');

// Bootstrap error handling
bootstrap().catch((err) => {
  Logger.error('💀 Bootstrap failed:', err);
  process.exit(1);
});
```

**Beneficio:** Azure load balancer puede alcanzar el servidor; errores se imprimen y el proceso sale cleanly.

---

### 2.5 CORS & Cookie Security (Configurable)
**Archivo:** `src/main.ts` (líneas 16-160, 207-275)

#### Helper Functions
```typescript
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
}

function parseSameSiteEnv(
  value: string | undefined,
  defaultValue: 'lax' | 'strict' | 'none',
): 'lax' | 'strict' | 'none' {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
    return normalized;
  }
  return defaultValue;
}
```

#### Usage
```typescript
const corsEnabled = parseBooleanEnv(process.env.CORS_ENABLED, true);
const cookieSecure = parseBooleanEnv(process.env.COOKIE_SECURE, isProduction);
let cookieSameSite = parseSameSiteEnv(
  process.env.COOKIE_SAMESITE,
  cookieSecure ? 'none' : 'lax',
);

// CORS
if (corsEnabled) {
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // ...
  });
}

// Session cookies
const sessionConfig = {
  // ...
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
  },
};

// CSRF cookies
const csrfConfig = doubleCsrf({
  // ...
  cookieOptions: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: '/',
  },
  // ...
});
```

**Beneficio:** Prender/apagar CORS y cambiar configuración de cookies sin tocar código.

---

### 2.6 Dockerfile.prod - Eliminar HEALTHCHECK Problemático
**Archivo:** `Dockerfile.prod` (líneas 53-60)

**ANTES:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get(...)"
```

**DESPUÉS:**
```dockerfile
# Azure App Service tiene su propio mecanismo de health probes.
# El HEALTHCHECK de Docker puede matar el contenedor prematuramente.
# NO usar HEALTHCHECK aquí — Azure lo maneja.

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
```

**Beneficio:** El healthcheck no mata el contenedor si tarda >40s en arrancar.

---

## 3️⃣ ENDPOINTS DE MUTACIÓN - ORGANIZATIONS (Control Plane)

### 3.1 Nuevo DTO: UpdateGlobalOrganizationDto
**Archivo:** `src/app/modules/control-plane/organizations/dto/update-global-organization.dto.ts`

```typescript
export class UpdateGlobalOrganizationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tax_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsUUID('4', { message: 'El ID del país debe ser un UUID válido' })
  @IsOptional()
  country_id?: string;
}
```

---

### 3.2 Endpoint: PUT /api/admin/organizations/:id (Update)

**Método HTTP:** `PUT` (antes era `PATCH`)

**DTO:** `UpdateGlobalOrganizationDto` (propiedades opcionales)

**Respuestas HTTP:**
- `200 OK` - Organización actualizada
- `400 Bad Request` - Datos inválidos o colisión de `name`/`tax_id`
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado (no eres SUPER_ADMIN)
- `404 Not Found` - Organización no existe

**Lógica de Negocio:**
```typescript
async update(id: string, changes: UpdateGlobalOrganizationDto) {
  const org = await this.findOne(id);

  // Validar colisión de NAME
  if (changes.name && changes.name !== org.name) {
    const existingByName = await this.repo.findOne({
      where: { name: changes.name },
    });
    if (existingByName && existingByName.id !== id) {
      throw new BadRequestException(
        'Ya existe otra organización con ese nombre.',
      );
    }
  }

  // Validar colisión de TAX_ID
  if (changes.tax_id && changes.tax_id !== org.tax_id) {
    const existingByTaxId = await this.repo.findOne({
      where: { tax_id: changes.tax_id },
    });
    if (existingByTaxId && existingByTaxId.id !== id) {
      throw new BadRequestException(
        'Ya existe otra organización con ese Tax ID.',
      );
    }
  }

  // Mapear DTO → Entity
  const mergeData: Partial<GlobalOrganization> = {
    name: changes.name,
    tax_id: changes.tax_id,
    description: changes.description,
    countryId: changes.country_id, // DTO usa country_id, entidad usa countryId
  };

  this.repo.merge(org, mergeData);
  return this.repo.save(org);
}
```

**Ejemplo Request:**
```bash
curl -X PUT http://localhost:3000/api/admin/organizations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{
    "name": "ONG Nuevo Nombre",
    "tax_id": "NIT-654321",
    "country_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

---

### 3.3 Endpoint: DELETE /api/admin/organizations/:id (Delete)

**Método HTTP:** `DELETE`

**Respuestas HTTP:**
- `200 OK` - Organización eliminada
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado (no eres SUPER_ADMIN)
- `404 Not Found` - Organización no existe
- `409 Conflict` - Organización tiene usuarios asociados

**Lógica de Negocio:**
```typescript
async remove(id: string) {
  // Verificar que existe
  const org = await this.findOne(id);

  // Contar usuarios asociados
  const userCount = await this.userRepo.count({
    where: { organizationId: id },
  });

  // Prevención: Si hay usuarios, abortar
  if (userCount > 0) {
    throw new ConflictException(
      `No se puede eliminar la organización porque tiene ${userCount} usuarios asociados. Reasigne o elimine los usuarios primero.`,
    );
  }

  // Borrado seguro
  await this.repo.delete(id);
  return {
    message: `Organización '${org.name}' eliminada exitosamente.`,
    deletedId: id,
  };
}
```

**Ejemplo Request:**
```bash
curl -X DELETE http://localhost:3000/api/admin/organizations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Cookie: connect.sid=..."
```

**Ejemplo Response (409 Conflict):**
```json
{
  "statusCode": 409,
  "message": "No se puede eliminar la organización porque tiene 3 usuarios asociados. Reasigne o elimine los usuarios primero.",
  "error": "Conflict"
}
```

---

## 4️⃣ VARIABLES DE ENTORNO

### Local Development (.env)
```env
CORS_ENABLED=true
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

### Production Azure (.env.production.azure)
```env
CORS_ENABLED=true
COOKIE_SECURE=true
COOKIE_SAMESITE=none
DB_SSL=true
```

### Explicación
| Variable | Local | Producción | Propósito |
|----------|-------|-----------|----------|
| `CORS_ENABLED` | true | true | Permitir/denegar cross-origin requests |
| `COOKIE_SECURE` | false | true | HTTP vs HTTPS |
| `COOKIE_SAMESITE` | lax | none | Restricción de cookies cross-site |
| `DB_SSL` | N/A | true | Fuerza SSL en PostgreSQL |

---

## 5️⃣ ARCHIVOS MODIFICADOS

| Archivo | Tipo Cambio | Descripción |
|---------|-----------|-------------|
| `src/main.ts` | Modificado | Trust proxy, HTTP binding, CORS/cookies configurable, bootstrap error handling |
| `src/app/app.module.ts` | Modificado | TypeORM connectTimeoutMS + extra timeouts |
| `src/app/modules/tenancy/tenant-connection.service.ts` | Modificado | SSL + connectTimeoutMS en conexiones silo tenant |
| `src/app/modules/control-plane/tenants/tenants.service.ts` | Modificado | SSL + conectTimeoutMS en DataSource creación/adición miembros |
| `Dockerfile.prod` | Modificado | Eliminado HEALTHCHECK, mejorado ENTRYPOINT |
| `src/app/modules/control-plane/organizations/global-organizations.controller.ts` | Modificado | PUT en lugar de PATCH, import UpdateGlobalOrganizationDto, mejora respuestas Swagger |
| `src/app/modules/control-plane/organizations/global-organizations.service.ts` | Modificado | Método update() con validación de colisiones, método remove() con prevención de eliminación |
| `src/app/modules/control-plane/organizations/dto/update-global-organization.dto.ts` | Nuevo | DTO para operación Update con propiedades opcionales |
| `.env` | Modificado | Agregados CORS_ENABLED, COOKIE_SECURE, COOKIE_SAMESITE |
| `.env.example` | Modificado | Documentados los flags nuevos |
| `.env.production.azure.example` | Modificado | Configuración recomendada para producción |

---

## 6️⃣ TESTING & VALIDACIÓN

### Build Local
```bash
npm run build
# ✅ Build successful
```

### Comandos de Arranque

**Desarrollo (watch mode):**
```bash
npm run start:dev
# Arranca en puerto 3000, recompila al cambiar archivos
```

**Producción simulada (local):**
```bash
npm run start:prod
# Arranca en puerto 3000, código compilado (dist/)
```

**Docker (Producción):**
```bash
docker build --no-cache -f Dockerfile.prod -t cansecoang/oroverde-api:latest .
docker run -e PORT=3000 -e NODE_ENV=production ... cansecoang/oroverde-api:latest
```

---

## 7️⃣ CHECKLIST PARA FRONTEND

Puntos a trabajar en el frontend Angular según estos cambios backend:

### CORS & Cookies
- [ ] Implementar interceptor HTTP para `withCredentials: true`
- [ ] Configurar `ALLOWED_ORIGINS` en backend `.env.production`
- [ ] Validar que las cookies se envían correctamente en requests posteriores al login

### Organizations Module
- [ ] Implementar formulario UPDATE para PUT /api/admin/organizations/:id
- [ ] Implementar diálogo DELETE con confirmación
- [ ] Manejar error 409 (Conflict) cuando hay usuarios asociados
- [ ] Validar que name/tax_id no colisionen (feedback visual)
- [ ] Mostrar mensaje de éxito/error después de Update/Delete

### Health & Monitoring
- [ ] Verificar logs en Azure App Service después de despliegue
- [ ] Monitorear startup time con las nuevas métricas de timeout
- [ ] Confirmar que CORS funciona entre puerto 4200 → 3000

### Testing
- [ ] Probar login en Postman/Swagger
- [ ] Crear, actualizar, listar, eliminar organizaciones
- [ ] Intentar eliminar organización con usuarios (validar 409)
- [ ] Intentar actualizar name/tax_id duplicado (validar 400)

---

## 📌 Notas Importantes

1. **Variables de entorno críticas:**
   - Cambiar `SESSION_SECRET` antes de producción (mín 32 caracteres)
   - Configurar `ALLOWED_ORIGINS` correctamente en Azure
   - Habilitar `DB_SSL=true` si usas Azure PostgreSQL

2. **Migración a producción:**
   - Hacer `docker build --no-cache` para incluir todos los fixes
   - Actualizar env de Azure App Service
   - Reiniciar contenedor después de cambios

3. **Debugging:**
   - Si "silent crash" persiste, revisar logs de Azure en 
     → Diagnóstico y Solución de Problemas → Registros de Aplicación
   - Buscar errores de conexión PostgreSQL con timeout de 10s

---

**Fecha Documento:** 7 de Marzo de 2026  
**Estado:** ✅ Implementado y Compilado  
**Build:** npm run build → SUCCESS

---

## 8️⃣ ENDPOINTS DE MUTACIÓN - USERS (Control Plane)

### 8.1 Nuevos DTOs

**Archivo:** `src/app/modules/control-plane/users/dto/update-user.dto.ts`
```typescript
export class UpdateUserDto {
  @IsString() @IsOptional() first_name?: string;
  @IsString() @IsOptional() last_name?: string;
  @IsUUID('4') @IsOptional() organization_id?: string;
}
```

**Archivo:** `src/app/modules/control-plane/users/dto/update-user-status.dto.ts`
```typescript
export class UpdateUserStatusDto {
  @IsBoolean() isActive: boolean;  // obligatorio
}
```

---

### 8.2 Endpoint: PUT /api/admin/users/:id (Update)

**Método HTTP:** `PUT`

**DTO:** `UpdateUserDto` (propiedades opcionales)

**Respuestas HTTP:**
- `200 OK` - Usuario actualizado
- `400 Bad Request` - Datos inválidos o organización no existe
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado (no eres SUPER_ADMIN)
- `404 Not Found` - Usuario no encontrado

**Lógica de Negocio:**
- Si se envía `organization_id`, valida que la organización destino exista en el Control Plane.
- Mapea DTO → Entity: `first_name` → `firstName`, `last_name` → `lastName`, `organization_id` → `organizationId`.
- Emite evento `user.updated` para propagación a silos de tenants (ver Fase 8.2).

**Ejemplo Request:**
```bash
curl -X PUT http://localhost:3000/api/admin/users/UUID \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{ "first_name": "Carlos", "last_name": "Méndez", "organization_id": "UUID-org" }'
```

---

### 8.3 Endpoint: PATCH /api/admin/users/:id/status (Activate/Deactivate)

**Método HTTP:** `PATCH`

**DTO:** `UpdateUserStatusDto` (`isActive` obligatorio)

**Respuestas HTTP:**
- `200 OK` - Estado actualizado
- `400 Bad Request` - No puede desactivar su propia cuenta
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado
- `404 Not Found` - Usuario no encontrado

**Lógica de Negocio (Stateful Revocation):**
1. Actualiza `isActive` en la base de datos.
2. **SI `isActive === false`:** Invoca `SessionService.purgeUserSessions(userId)`:
   - Conecta a Redis con la misma configuración que `main.ts`
   - Escanea TODAS las keys `saas_sess:*` con SCAN cursor
   - Deserializa cada sesión, busca `session.passport.user.id === userId`
   - Elimina las coincidencias con `DEL`
   - Retorna la cantidad de sesiones purgadas
3. Prevención: El controller bloquea auto-desactivación (`req.user.id === id`).

**Ejemplo Response (desactivación):**
```json
{
  "message": "Usuario 'admin@org.com' desactivado. 2 sesión(es) purgada(s).",
  "isActive": false,
  "sessionsPurged": 2
}
```

---

### 8.4 Endpoint: DELETE /api/admin/users/:id (Hard Delete)

**Método HTTP:** `DELETE`

**Respuestas HTTP:**
- `200 OK` - Usuario eliminado
- `400 Bad Request` - No puede eliminar su propia cuenta
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado
- `404 Not Found` - Usuario no encontrado
- `409 Conflict` - Usuario activo o con workspaces asociados

**Prevención de Silos Huérfanos (triple check):**
1. **Controller:** No puedes eliminarte a ti mismo (`req.user.id === id` → 400).
2. **Service:** Usuario activo → debe desactivarse primero (409 Conflict).
3. **Service:** Verifica `tenant_members` — si pertenece a N workspace(s), debe retirarse primero (409 Conflict).

**Ejemplo Response (409 — activo):**
```json
{
  "statusCode": 409,
  "message": "No se puede eliminar un usuario activo. Desactívelo primero (PATCH /status).",
  "error": "Conflict"
}
```

**Ejemplo Response (409 — workspaces):**
```json
{
  "statusCode": 409,
  "message": "No se puede eliminar el usuario porque pertenece a 3 workspace(s). Retírelo de todos los workspaces primero.",
  "error": "Conflict"
}
```

---

### 8.5 Nuevo Servicio: SessionService (Purga de sesiones Redis)

**Archivo:** `src/app/common/services/session.service.ts`

Servicio inyectable que conecta directamente a Redis para purgar sesiones:
- Lee configuración de `REDIS_HOST/REDIS_PASSWORD` o `REDIS_URL` (misma lógica que `main.ts`)
- Usa `SCAN` con cursor para iterar keys `saas_sess:*`
- Deserializa JSON, compara `passport.user.id`
- Elimina con `DEL` y cierra la conexión
- Si Redis no está configurado, hace log warning y retorna 0

---

## 9️⃣ FASE 8.2: PROPAGACIÓN DE DATOS (Control Plane → App Plane)

### Arquitectura: Consistencia Eventual basada en Eventos

```
┌─────────────────────┐     emit()      ┌───────────────────────┐
│  OrganizationsService│ ──────────────► │                       │
│  PUT /organizations  │  'org.updated'  │   TenantSyncListener  │
└─────────────────────┘                  │                       │
                                         │  @OnEvent(async:true) │
┌─────────────────────┐     emit()      │                       │
│  UsersService        │ ──────────────► │  ┌─ pg.Client ──────┐ │
│  PUT /users          │  'user.updated' │  │ tenant_db_1      │ │
└─────────────────────┘                  │  │ tenant_db_2      │ │
                                         │  │ tenant_db_N      │ │
                                         │  └──────────────────┘ │
                                         └───────────────────────┘
```

**Dependencia instalada:** `@nestjs/event-emitter` (EventEmitter2)

**Registro:** `EventEmitterModule.forRoot()` en `AppModule.imports`

---

### 9.1 Emisión de Eventos

**OrganizationsService** (`update()` — después del `save()`):
```typescript
this.eventEmitter.emit('organization.updated', {
  id: saved.id,
  name: saved.name,
  tax_id: saved.tax_id,
});
```

**UsersService** (`update()` — después del `save()`):
```typescript
this.eventEmitter.emit('user.updated', {
  id: saved.id,
  email: saved.email,
  firstName: saved.firstName,
  lastName: saved.lastName,
});
```

---

### 9.2 TenantSyncListener (Archivo Nuevo)

**Archivo:** `src/app/modules/control-plane/tenant-sync.listener.ts`

**`@OnEvent('organization.updated', { async: true })`:**
1. Consulta TODOS los tenants activos del Control Plane (`tenants WHERE status = 'ACTIVE'`).
2. Itera cada tenant. Abre un `pg.Client` directo a su `db_name`.
3. Ejecuta: `UPDATE workspace_organizations SET name = $1, tax_id = $2 WHERE global_reference_id = $3`
4. **try/catch por iteración** — si un tenant falla, loguea error y continúa al siguiente.
5. Cierra la conexión pg en `finally`.

**`@OnEvent('user.updated', { async: true })`:**
1. **Eficiencia:** No itera todos los tenants. Hace JOIN `tenant_members + tenants` filtrando por `userId` para descubrir solo las BDs relevantes.
2. Itera la sub-lista. Abre `pg.Client` a cada `db_name`.
3. Ejecuta: `UPDATE workspace_members SET email = $1, full_name = $2 WHERE "userId" = $3`
   - `full_name` = `firstName + ' ' + lastName` (concatenación del Control Plane)
4. Mismo patrón try/catch por iteración.

**Conexión dinámica (`executeOnTenantDb`):**
```typescript
private async executeOnTenantDb(dbName: string, query: string, params: any[]): Promise<number> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: dbName,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });
  try {
    await client.connect();
    const result = await client.query(query, params);
    return result.rowCount ?? 0;
  } finally {
    await client.end().catch(() => {});
  }
}
```

---

### 9.3 Manejo de Excepciones — Resiliencia

**Principio:** Un fallo en un tenant NO debe tirar abajo la propagación completa.

| Capa | Protección |
|------|-----------|
| **Evento async** | `@OnEvent({ async: true })` — el emit() no bloquea el response HTTP al admin |
| **Loop try/catch** | Cada iteración de tenant está en su propio try/catch — si tenant_A está caído, tenant_B y tenant_C siguen |
| **pg.Client finally** | La conexión se cierra SIEMPRE, incluso si el query falló |
| **Logger.error** | Errores individuales quedan en logs para auditoría |
| **rowCount check** | Si `rowCount === 0` (la org/usuario no existe en ese tenant), simplemente se loguea como "skip" — no es un error |

---

## 🔟 ARCHIVOS MODIFICADOS/CREADOS (Sesión completa)

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/main.ts` | Modificado | Trust proxy, HTTP binding, CORS/cookies configurable |
| `src/app/app.module.ts` | Modificado | TypeORM timeouts + `EventEmitterModule.forRoot()` |
| `src/app/modules/tenancy/tenant-connection.service.ts` | Modificado | SSL + connectTimeoutMS |
| `src/app/modules/control-plane/tenants/tenants.service.ts` | Modificado | SSL + timeouts |
| `Dockerfile.prod` | Modificado | Eliminado HEALTHCHECK |
| `src/app/modules/control-plane/organizations/global-organizations.controller.ts` | Modificado | PUT, UPDATE DTO, DELETE docs |
| `src/app/modules/control-plane/organizations/global-organizations.service.ts` | Modificado | Update/Remove + emit `organization.updated` |
| `src/app/modules/control-plane/organizations/dto/update-global-organization.dto.ts` | Nuevo | DTO para Update organizaciones |
| `src/app/modules/control-plane/users/global-users.controller.ts` | Modificado | PUT, PATCH status, DELETE endpoints |
| `src/app/modules/control-plane/users/users.service.ts` | Modificado | Update/UpdateStatus/Remove + emit `user.updated` |
| `src/app/modules/control-plane/users/dto/update-user.dto.ts` | Nuevo | DTO para Update usuarios |
| `src/app/modules/control-plane/users/dto/update-user-status.dto.ts` | Nuevo | DTO para Activate/Deactivate |
| `src/app/common/services/session.service.ts` | Nuevo | Purga de sesiones Redis |
| `src/app/modules/control-plane/tenant-sync.listener.ts` | Nuevo | Listener de propagación event-driven |
| `src/app/modules/control-plane/control-plane.module.ts` | Modificado | Registrado SessionService + TenantSyncListener |
| `.env` / `.env.example` / `.env.production.azure.example` | Modificado | CORS/Cookie toggles |

---

**Última Actualización:** 7 de Marzo de 2026  
**Build:** npm run build → SUCCESS
