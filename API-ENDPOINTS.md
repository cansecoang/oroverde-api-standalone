# API Endpoints — Referencia para Frontend

> **Base URL**: `http://localhost:3000` (dev) · Producción: variable de entorno  
> **Autenticación**: Cookie de sesión (`connect.sid`) — se establece automáticamente al hacer login  
> **CSRF**: Header `x-csrf-token` requerido en toda mutación (POST/PUT/PATCH/DELETE). El token se obtiene de la cookie `__csrf`  
> **Tenant Context**: Los endpoints del App Plane requieren el header `x-tenant-id: <slug>` para identificar el workspace

---

## Tabla de Contenidos

1. [Autenticación (Auth)](#1-autenticación)
2. [Admin — Dashboard](#2-admin--dashboard)
3. [Admin — Users](#3-admin--users)
4. [Admin — Organizations](#4-admin--organizations)
5. [Admin — Tenants](#5-admin--tenants)
6. [Admin — Countries](#6-admin--countries)
7. [Setup (Workspace)](#7-setup)
8. [Dashboard (Workspace)](#8-dashboard-workspace)
9. [Members (Workspace)](#9-members)
10. [Organizations (Workspace)](#10-organizations-workspace)
11. [Countries (Workspace)](#11-countries-workspace)
12. [Catalogs](#12-catalogs)
13. [Field Definitions](#13-field-definitions)
14. [Products](#14-products)
15. [Product Members](#15-product-members)
16. [Tasks](#16-tasks)
17. [Strategy](#17-strategy)
18. [Check-Ins](#18-check-ins)
19. [Enums de Referencia](#19-enums-de-referencia)

---

## 1. Autenticación

Prefijo: `/auth` — No requiere `x-tenant-id`

### POST `/auth/login`

Login con email y password. Establece cookie de sesión `connect.sid`.

**Body:**
```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

**Response 201:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "firstName": "Admin",
    "lastName": "User",
    "globalRole": "super_admin",
    "organizationId": "uuid",
    "isActive": true,
    "mustChangePassword": false,
    "created_at": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "mustChangePassword": false
}
```

**Errores:** `401` credenciales inválidas o cuenta inactiva

---

### POST `/auth/logout`

Destruye la sesión y limpia la cookie. Requiere sesión activa.

**Headers:** `x-csrf-token`  
**Response 201:**
```json
{ "message": "Signed out" }
```

---

### GET `/auth/me`

Perfil del usuario autenticado. Requiere sesión activa.

**Response 200:**
```json
{
  "id": "uuid",
  "email": "admin@example.com",
  "firstName": "Admin",
  "lastName": "User",
  "globalRole": "super_admin",
  "organizationId": "uuid",
  "isActive": true,
  "mustChangePassword": false,
  "created_at": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

### GET `/auth/session`

Alias de `/auth/me`. Mismo comportamiento y respuesta.

---

### GET `/auth/my-workspaces`

Workspaces accesibles por el usuario. Super Admin ve todos los activos; otros usuarios solo donde son miembros.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Workspace A",
    "slug": "workspace-a",
    "status": "ACTIVE",
    "logoUrl": null,
    "location": null,
    "description": "Descripción",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### GET `/auth/activate?token=<activation_token>`

Activa una cuenta de usuario con el token recibido por email. No requiere sesión.

**Response 200:**
```json
{ "message": "Account activated successfully." }
```

**Errores:** `400` token inválido o expirado

---

### POST `/auth/change-password`

Cambiar contraseña (obligatorio en primer login si `mustChangePassword: true`). Requiere sesión activa.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecure456"
}
```

**Validadores:** `newPassword` mínimo 8 caracteres  
**Response 201:**
```json
{ "message": "Password updated successfully" }
```

**Errores:** `400` contraseña actual incorrecta o nueva contraseña muy corta

---

### POST `/auth/forgot-password`

Solicitar código de reset (6 dígitos). Se envía por email. No requiere sesión.

**Body:**
```json
{ "email": "user@example.com" }
```

**Response 201** (siempre, aunque el email no exista):
```json
{ "message": "If that email is registered, a reset code has been sent." }
```

---

### POST `/auth/verify-reset-code`

Verifica el código de 6 dígitos y devuelve un token de reset.

**Body:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response 201:**
```json
{ "resetToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

**Errores:** `400` código inválido o expirado

---

### POST `/auth/reset-password`

Establece nueva contraseña usando el reset token.

**Body:**
```json
{
  "resetToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "newPassword": "newSecure456"
}
```

**Validadores:** `newPassword` mínimo 8 caracteres  
**Response 201:**
```json
{ "message": "Password has been reset successfully." }
```

**Errores:** `400` token inválido/expirado o contraseña muy corta

---

## 2. Admin — Dashboard

Prefijo: `/admin` — Requiere rol `SUPER_ADMIN`

### GET `/admin`

Verifica que el Control Plane está activo.

**Response 200:**
```json
{
  "message": "Control Plane activo",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

---

### GET `/admin/dashboard-stats`

Estadísticas globales del sistema.

**Response 200:**
```json
{
  "users": {
    "total": 50,
    "active": 45,
    "inactive": 5
  },
  "organizations": {
    "total": 12
  },
  "tenants": {
    "total": 5,
    "active": 3,
    "suspended": 1,
    "archived": 1
  }
}
```

---

## 3. Admin — Users

Prefijo: `/admin/users` — Requiere rol `SUPER_ADMIN`

### POST `/admin/users`

Crear usuario global. Se envía email de activación automáticamente.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "email": "nuevo@example.com",
  "firstName": "Juan",
  "lastName": "Pérez",
  "orgId": "uuid-de-organizacion"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `email` | string | ✅ | `@IsEmail` |
| `firstName` | string | ✅ | `@IsString`, `@IsNotEmpty` |
| `lastName` | string | ✅ | `@IsString`, `@IsNotEmpty` |
| `orgId` | string | ✅ | `@IsUUID` |

**Response 201:** El usuario creado (sin `password_hash`)

---

### GET `/admin/users?page=1&limit=10`

Listar usuarios con paginación.

**Query Params:**
| Param | Tipo | Default |
|-------|------|---------|
| `page` | number | 1 |
| `limit` | number | 10 |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "Juan",
      "lastName": "Pérez",
      "globalRole": "user",
      "organizationId": "uuid",
      "isActive": true,
      "mustChangePassword": false,
      "created_at": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "organization": {
        "id": "uuid",
        "name": "Org A",
        "tax_id": "RFC123"
      },
      "tenants": [
        { "id": "uuid", "tenantId": "uuid", "userId": "uuid" }
      ]
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

---

### GET `/admin/users/:id`

Obtener usuario por UUID.

**Response 200:** Objeto usuario igual que en el array de `items` anterior  
**Errores:** `404` usuario no encontrado

---

### PUT `/admin/users/:id`

Actualizar perfil de usuario (nombre, apellido, organización).

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "first_name": "Nuevo Nombre",
  "last_name": "Nuevo Apellido",
  "organization_id": "uuid-nueva-org"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `first_name` | string | ❌ | `@IsString` |
| `last_name` | string | ❌ | `@IsString` |
| `organization_id` | string | ❌ | `@IsUUID('4')` |

**Response 200:** Usuario actualizado  
**Errores:** `404` usuario/organización no encontrada

> ℹ️ Emite evento `user.updated` que propaga los cambios a todos los workspaces donde el usuario es miembro.

---

### PATCH `/admin/users/:id/role`

Cambiar el rol global del usuario (promover a super_admin o degradar a user).

**Headers:** `x-csrf-token`  
**Body:**
```json
{ "globalRole": "super_admin" }
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `globalRole` | GlobalRole | ✅ | `super_admin` o `user` |

**Response 200:**
```json
{
  "message": "Rol de 'user@example.com' actualizado de 'user' a 'super_admin'.",
  "id": "uuid",
  "email": "user@example.com",
  "previousRole": "user",
  "currentRole": "super_admin"
}
```

**Lógica de control:**
- No se puede cambiar el propio rol (previene auto-degradación)
- No se puede degradar al único Super Admin del sistema (siempre debe existir al menos uno)
- Si se degrada de `super_admin` → `user`, se purgan sus sesiones para forzar re-login con permisos reducidos (la respuesta incluye `sessionsPurged`)

**Errores:**
- `400` no puede cambiar su propio rol
- `400` último Super Admin del sistema
- `404` usuario no encontrado

---

### PATCH `/admin/users/:id/status`

Activar o desactivar usuario. Al desactivar, se purgan todas sus sesiones activas de Redis.

**Headers:** `x-csrf-token`  
**Body:**
```json
{ "isActive": false }
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `isActive` | boolean | ✅ | `@IsBoolean` |

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "isActive": false,
  "sessionsPurged": 3
}
```

**Errores:** `400` no puedes desactivarte a ti mismo · `404` usuario no encontrado

---

### DELETE `/admin/users/:id`

Eliminar usuario permanentemente. Solo se puede eliminar si está desactivado y no tiene membresías en workspaces.

**Headers:** `x-csrf-token`  
**Response 200:**
```json
{ "message": "User removed successfully" }
```

**Errores:**
- `400` no puedes eliminarte a ti mismo
- `400` el usuario está activo (primero desactivar)
- `400` el usuario tiene membresías en workspaces
- `404` usuario no encontrado

---

## 4. Admin — Organizations

Prefijo: `/admin/organizations` — Requiere rol `SUPER_ADMIN`

### POST `/admin/organizations`

Crear organización global.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "ONG América",
  "tax_id": "RFC-1234",
  "description": "Organización sin fines de lucro",
  "countryId": "uuid-del-pais"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@IsString`, `@IsNotEmpty` |
| `tax_id` | string | ✅ | `@IsString`, `@IsNotEmpty` |
| `description` | string | ❌ | `@IsString` |
| `countryId` | string | ❌ | `@IsUUID('4')` |

**Response 201:** Organización creada

---

### GET `/admin/organizations?q=search&simple=true`

Listar organizaciones con búsqueda opcional.

**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `q` | string | Búsqueda por nombre (ILIKE) |
| `simple` | string | Si `"true"`, solo devuelve `id`, `name`, `tax_id` |

**Response 200:** Array de organizaciones

---

### GET `/admin/organizations/:id`

Obtener organización por UUID.

**Response 200:**
```json
{
  "id": "uuid",
  "name": "ONG América",
  "tax_id": "RFC-1234",
  "description": "...",
  "country_id": "uuid",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

### PUT `/admin/organizations/:id`

Actualizar organización global.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Nuevo Nombre",
  "tax_id": "RFC-5678",
  "description": "Actualizado",
  "country_id": "uuid-pais"
}
```

**Validadores:** Todos los campos son opcionales.  
**Response 200:** Organización actualizada

> ℹ️ Emite evento `organization.updated` que propaga `name` y `tax_id` a todos los workspaces.

---

### DELETE `/admin/organizations/:id`

Eliminar organización. Solo si no tiene usuarios asignados.

**Headers:** `x-csrf-token`  
**Response 200:**
```json
{ "message": "Organization deleted" }
```

**Errores:** `409` la organización tiene usuarios asignados

---

## 5. Admin — Tenants

Prefijo: `/admin/tenants` — Requiere rol `SUPER_ADMIN`

### POST `/admin/tenants`

Crear tenant (workspace) con base de datos aislada.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Proyecto Verde 2025",
  "slug": "proyecto-verde-2025",
  "description": "Workspace dedicado al proyecto",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "logoUrl": "https://example.com/logo.png"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@MaxLength(100)` |
| `slug` | string | ❌ | Solo `a-z0-9` y guiones. Auto-generado si se omite |
| `description` | string | ❌ | |
| `startDate` | string | ❌ | ISO 8601 |
| `endDate` | string | ❌ | ISO 8601 |
| `logoUrl` | string | ❌ | |

**Response 201:**
```json
{
  "msg": "Tenant created with isolated database",
  "tenant": {
    "id": "uuid",
    "name": "Proyecto Verde 2025",
    "slug": "proyecto-verde-2025",
    "status": "ACTIVE",
    "db_name": "tenant_proyecto_verde_2025",
    "description": "...",
    "start_date": "2025-01-01",
    "end_date": "2025-12-31",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
}
```

---

### GET `/admin/tenants`

Listar todos los tenants.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Proyecto Verde",
    "slug": "proyecto-verde",
    "status": "ACTIVE",
    "logoUrl": null,
    "description": "...",
    "startDate": "2025-01-01",
    "endDate": "2025-12-31",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

### POST `/admin/tenants/:id/members`

Agregar usuario como miembro del workspace.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "userId": "uuid-del-usuario",
  "tenantRole": "general_coordinator"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `userId` | string | ✅ | `@IsUUID` |
| `tenantRole` | TenantRole | ❌ | `general_coordinator` o `member` (default: `member`) |

**Response 201:**
```json
{
  "message": "Member added to tenant",
  "tenantSlug": "proyecto-verde",
  "role": "general_coordinator"
}
```

---

### PATCH `/admin/tenants/:id/status`

Cambiar estado del tenant.

**Headers:** `x-csrf-token`  
**Body:**
```json
{ "status": "SUSPENDED" }
```

**Validadores:**
| Campo | Tipo | Requerido | Valores |
|-------|------|-----------|---------|
| `status` | TenantStatus | ✅ | `ACTIVE`, `SUSPENDED`, `ARCHIVED` |

**Response 200:** Tenant actualizado

---

### DELETE `/admin/tenants/:id?dropDatabase=true`

Archivar o eliminar tenant.

**Headers:** `x-csrf-token`  
**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `dropDatabase` | string | Si `"true"`, elimina la base de datos físicamente |

**Response 200:**
```json
{ "message": "Tenant archived/deleted" }
```

---

## 6. Admin — Countries

Prefijo: `/admin/countries` — Requiere rol `SUPER_ADMIN`

### GET `/admin/countries`

Listar todos los países del catálogo global.

**Response 200:**
```json
[
  {
    "id": "uuid",
    "code": "MX",
    "name": "Mexico",
    "timezone": "America/Mexico_City",
    "phone_code": "+52",
    "region": "Americas"
  }
]
```

---

### GET `/admin/countries/:code`

Obtener país por código ISO (2 caracteres).

**Response 200:** Objeto país

---

### POST `/admin/countries`

Crear país.

**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "code": "MX",
  "name": "Mexico",
  "timezone": "America/Mexico_City",
  "phone_code": "+52",
  "region": "Americas"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `code` | string | ✅ | Exactamente 2 caracteres |
| `name` | string | ✅ | `@IsNotEmpty` |
| `timezone` | string | ❌ | |
| `phone_code` | string | ❌ | |
| `region` | string | ❌ | |

---

### POST `/admin/countries/seed`

Sembrar todos los países ISO 3166-1 automáticamente.

**Headers:** `x-csrf-token`  
**Response 201:** Resultado del seed

---

### PUT `/admin/countries/:code`

Actualizar país. Todos los campos son opcionales.

**Headers:** `x-csrf-token`

---

### DELETE `/admin/countries/:code`

Eliminar país del catálogo global.

**Headers:** `x-csrf-token`

---

## 7. Setup

Prefijo: `/setup` — Requiere header `x-tenant-id`

### GET `/setup/status`

Estado de configuración/readiness del workspace. Útil para mostrar un wizard de setup.

**Response 200:**
```json
{
  "areas": [
    { "label": "Organizations",        "count": 3, "ready": true },
    { "label": "Team Members",         "count": 5, "ready": true },
    { "label": "Countries",            "count": 2, "ready": true },
    { "label": "Catalogs",             "count": 1, "ready": true },
    { "label": "Custom Fields",        "count": 0, "ready": false },
    { "label": "Strategic Outputs",    "count": 0, "ready": false },
    { "label": "Strategic Indicators", "count": 0, "ready": false },
    { "label": "Products",             "count": 0, "ready": false }
  ],
  "totalReady": 4,
  "totalAreas": 8,
  "percentage": 50
}
```

---

## 8. Dashboard (Workspace)

Prefijo: `/dashboard` — Requiere header `x-tenant-id`

### GET `/dashboard/stats`

Estadísticas del workspace actual.

**Response 200:**
```json
{
  "products": { "total": 15 },
  "tasks": { "total": 120, "completed": 45, "pending": 75 },
  "members": { "total": 25 },
  "organizations": { "total": 8 }
}
```

---

## 9. Members

Prefijo: `/members` — Requiere header `x-tenant-id`

### GET `/members/me`

Mi perfil como miembro del workspace actual.

**Permisos:** Cualquier miembro del workspace  
**Response 200:**
```json
{
  "id": "uuid",
  "userId": "uuid-global",
  "email": "user@example.com",
  "full_name": "Juan Pérez",
  "tenantRole": "general_coordinator",
  "alias": null,
  "organization_id": "uuid",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

### GET `/members?page=1&limit=10`

Listar miembros del workspace con paginación.

**Permisos:** `member:read`  
**Query Params:**
| Param | Tipo | Default |
|-------|------|---------|
| `page` | number | 1 |
| `limit` | number | 10 |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "email": "user@example.com",
      "full_name": "Juan Pérez",
      "tenantRole": "member",
      "alias": null,
      "organization_id": "uuid"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

---

### POST `/members/invite`

Invitar usuario existente como miembro del workspace.

**Permisos:** `member:manage`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "email": "nuevo@example.com",
  "role": "member",
  "alias": "Juanito"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `email` | string | ✅ | `@IsEmail` |
| `role` | TenantRole | ✅ | `general_coordinator` o `member` |
| `alias` | string | ❌ | |

---

## 10. Organizations (Workspace)

Prefijo: `/organizations` — Requiere header `x-tenant-id`

### GET `/organizations`

Listar organizaciones del workspace.

**Permisos:** `organization:read`  
**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "ONG América",
    "tax_id": "RFC-1234",
    "type": "implementadora",
    "contact_email": "info@ong.org",
    "global_reference_id": "uuid-global",
    "is_tenant_owner": false,
    "country_id": "MX"
  }
]
```

---

### GET `/organizations/global-search?q=ong`

Buscar organizaciones en el catálogo global (para vincularlas).

**Permisos:** `organization:manage`  
**Query Params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `q` | string | Búsqueda por nombre (ILIKE) |

---

### POST `/organizations/link-global`

Vincular una organización global existente al workspace. Crea una copia local.

**Permisos:** `organization:manage`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{ "globalId": "uuid-de-org-global" }
```

---

### POST `/organizations`

Crear organización manual (exclusiva del workspace, sin referencia global).

**Permisos:** `organization:manage`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Org Local",
  "tax_id": "LOCAL-001",
  "type": "ejecutora",
  "contact_email": "org@local.com"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@IsNotEmpty` |
| `tax_id` | string | ✅ | `@IsNotEmpty` |
| `type` | string | ❌ | |
| `contact_email` | string | ❌ | `@IsEmail` |

---

## 11. Countries (Workspace)

Prefijo: `/countries` — Requiere header `x-tenant-id`

### GET `/countries`

Países habilitados en este workspace.

**Response 200:**
```json
[
  { "id": "MX", "name": "Mexico", "timezone": "America/Mexico_City" }
]
```

---

### GET `/countries/global`

Catálogo global completo de países (para seleccionar cuáles habilitar).

---

### GET `/countries/suggestions`

Países sugeridos basados en las organizaciones del workspace.

---

### POST `/countries`

Agregar un país al workspace.

**Headers:** `x-csrf-token`  
**Body:**
```json
{ "code": "MX" }
```

**Validadores:** `code` — string, exactamente 2 caracteres, requerido

---

### POST `/countries/bulk`

Agregar múltiples países al workspace.

**Headers:** `x-csrf-token`  
**Body:**
```json
{ "codes": ["MX", "GT", "HN", "SV"] }
```

**Validadores:** `codes` — array de strings, cada uno de 2 caracteres, array no vacío

---

### DELETE `/countries/:code`

Eliminar un país del workspace.

**Headers:** `x-csrf-token`

---

## 12. Catalogs

Prefijo: `/catalogs` — Requiere header `x-tenant-id`

### GET `/catalogs`

Listar todos los catálogos del workspace.

**Permisos:** `catalog:read`  
**Response 200:**
```json
[
  {
    "id": "uuid",
    "code": "TASK_STATUS",
    "name": "Task Statuses",
    "description": null,
    "is_system": true,
    "items": [
      { "id": "uuid", "name": "To Do", "code": "TODO", "display_order": 0 },
      { "id": "uuid", "name": "In Progress", "code": "IN_PROGRESS", "display_order": 1 },
      { "id": "uuid", "name": "Done", "code": "DONE", "display_order": 2 }
    ]
  }
]
```

---

### GET `/catalogs/:code`

Obtener catálogo por su código (e.g., `TASK_STATUS`).

**Permisos:** `catalog:read`

---

### GET `/catalogs/options/:type`

Items de un tipo específico de catálogo. Útil para poblar dropdowns.

**Permisos:** `task:read`  
**Params:** `type` — valor del enum `CatalogType`: `TASK_STATUS`, `WORK_PACKAGES`, `TASK_PHASES`

**Response 200:**
```json
[
  { "id": "uuid", "name": "To Do", "code": "TODO", "display_order": 0 }
]
```

---

### POST `/catalogs`

Crear catálogo con items iniciales.

**Permisos:** `catalog:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Tipos de Entregable",
  "code": "DELIVERABLE_TYPES",
  "items": ["Informe", "Presentación", "Software", "Capacitación"]
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@MaxLength(100)` |
| `code` | string | ✅ | `@MaxLength(50)` |
| `items` | string[] | ✅ | Array con mínimo 1 elemento |

---

## 13. Field Definitions

Prefijo: `/field-definitions` — Requiere header `x-tenant-id`

Define campos dinámicos/custom para los productos del workspace.

### GET `/field-definitions`

Obtener el template de campos custom del workspace.

**Permisos:** `field_def:read`  
**Response 200:**
```json
[
  {
    "id": "uuid",
    "key": "budget",
    "label": "Presupuesto (USD)",
    "type": "NUMBER",
    "linkedCatalogCode": null,
    "required": true,
    "order": 0
  },
  {
    "id": "uuid",
    "key": "donor_org",
    "label": "Organización Donante",
    "type": "CATALOG_REF",
    "linkedCatalogCode": "DONORS",
    "required": false,
    "order": 1
  }
]
```

---

### POST `/field-definitions`

Crear nueva definición de campo.

**Permisos:** `field_def:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "key": "budget",
  "label": "Presupuesto (USD)",
  "type": "NUMBER",
  "linkedCatalogCode": null,
  "required": true,
  "order": 0
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `key` | string | ✅ | `@MaxLength(100)`, inmutable después de creado |
| `label` | string | ✅ | `@MaxLength(200)` |
| `type` | string | ✅ | `TEXT`, `NUMBER`, `DATE`, `CATALOG_REF`, `BOOLEAN` |
| `linkedCatalogCode` | string | ❌ | Requerido si `type` = `CATALOG_REF` |
| `required` | boolean | ❌ | |
| `order` | number | ❌ | `@IsInt`, `@Min(0)` |

---

### PATCH `/field-definitions/:id`

Actualizar campo (no se puede cambiar la `key`).

**Permisos:** `field_def:write`  
**Headers:** `x-csrf-token`  
**Body:** Mismos campos que POST excepto `key`, todos opcionales

---

### PATCH `/field-definitions/reorder`

Reordenar todos los campos.

**Permisos:** `field_def:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "orderedIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

---

### DELETE `/field-definitions/:id`

Eliminar definición de campo.

**Permisos:** `field_def:write`  
**Headers:** `x-csrf-token`

---

## 14. Products

Prefijo: `/products` — Requiere header `x-tenant-id`

### POST `/products`

Crear producto/proyecto.

**Permisos:** `product:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Proyecto Reforestación Norte",
  "objective": "Reforestar 500 hectáreas",
  "description": "Proyecto de reforestación en zonas degradadas",
  "methodology": "Siembra directa y reforestación asistida",
  "deliverable": "500 hectáreas reforestadas",
  "delivery_date": "2025-12-31",
  "ownerOrganizationId": "uuid-org",
  "countryId": "MX",
  "participatingOrganizationIds": ["uuid-org-1", "uuid-org-2"],
  "attributes": {
    "budget": 150000,
    "priority": "high"
  },
  "customOrgFields": [
    { "fieldId": "uuid-field-def", "orgIds": ["uuid-org-1", "uuid-org-2"] }
  ],
  "customCatalogFields": [
    { "fieldId": "uuid-field-def", "catalogItemIds": ["uuid-item-1"] }
  ]
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@IsNotEmpty` |
| `objective` | string | ❌ | |
| `description` | string | ❌ | |
| `methodology` | string | ❌ | |
| `deliverable` | string | ❌ | |
| `delivery_date` | string | ❌ | ISO 8601 date |
| `ownerOrganizationId` | string | ❌ | `@IsUUID('4')` |
| `countryId` | string | ❌ | 2 chars ISO |
| `participatingOrganizationIds` | string[] | ❌ | Array de UUIDs |
| `attributes` | object | ❌ | JSON libre |
| `customOrgFields` | array | ❌ | `[{ fieldId: UUID, orgIds: UUID[] }]` |
| `customCatalogFields` | array | ❌ | `[{ fieldId: UUID, catalogItemIds: UUID[] }]` |

---

### POST `/products/validate`

Validación dry-run del producto sin crearlo.

**Permisos:** `product:write`  
**Headers:** `x-csrf-token`  
**Body:** Mismo que POST `/products`

**Response 201:**
```json
{
  "valid": true,
  "errors": [],
  "message": "Validation passed"
}
```

O con errores:
```json
{
  "valid": false,
  "errors": [
    { "field": "name", "message": "Name is required", "value": null }
  ]
}
```

---

### GET `/products?page=1&limit=10&search=reforestación`

Listar productos con paginación y búsqueda.

**Permisos:** `product:read`  
**Query Params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | 1 | |
| `limit` | number | 10 | |
| `search` | string | — | Búsqueda por nombre |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Proyecto Reforestación",
      "objective": "...",
      "description": "...",
      "methodology": "...",
      "deliverable": "...",
      "delivery_date": "2025-12-31",
      "attributes": { "budget": 150000 },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "ownerOrganization": { "id": "uuid", "name": "ONG América" },
      "country": { "id": "MX", "name": "Mexico" },
      "participatingOrganizations": [...],
      "members": [
        {
          "id": "uuid",
          "productRole": "product_coordinator",
          "is_responsible": true,
          "allocation_percentage": 100,
          "member": { "id": "uuid", "full_name": "Juan Pérez", "email": "..." }
        }
      ],
      "strategies": [...]
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 10,
  "totalPages": 2
}
```

---

### GET `/products/:id`

Obtener producto con todas sus relaciones, incluyendo customLinks.

**Permisos:** `product:read`  
**Response 200:**
```json
{
  "id": "uuid",
  "name": "Proyecto Reforestación",
  "...": "...campos del producto...",
  "ownerOrganization": { "id": "uuid", "name": "ONG América" },
  "country": { "id": "MX", "name": "Mexico" },
  "participatingOrganizations": [...],
  "members": [...],
  "strategies": [
    {
      "id": "uuid",
      "committed_target": 100,
      "indicator": { "id": "uuid", "code": "1.1", "description": "..." }
    }
  ],
  "customLinks": {
    "donor_org": [{ "id": "uuid-org", "name": "USAID", "taxId": "US-001" }],
    "project_type": [{ "id": "uuid-item", "name": "Reforestación", "code": "REF" }]
  }
}
```

---

### PATCH `/products/:id`

Actualizar producto. Todos los campos son opcionales.

**Permisos:** `product:write`  
**Headers:** `x-csrf-token`  
**Body:** Mismos campos que POST, todos opcionales  
**Response 200:** Producto actualizado

> ℹ️ `attributes` se fusionan (merge) con los existentes. `participatingOrganizationIds` reemplaza la lista completa. `customOrgFields`/`customCatalogFields` reemplazan los existentes.

---

### DELETE `/products/:id`

Eliminar producto y todas sus relaciones (cascade).

**Permisos:** `product:write`  
**Headers:** `x-csrf-token`  
**Response 200:** Confirmación

---

### GET `/products/matrix/group-by-options`

Opciones disponibles para el dropdown de "agrupar por" en la matrix.

**Permisos:** `product:read`  
**Response 200:**
```json
[
  { "value": "owner_organization", "label": "Organización Líder", "available": true, "type": "base" },
  { "value": "responsible_member", "label": "Responsable", "available": true, "type": "base" },
  { "value": "country", "label": "País", "available": true, "type": "base" },
  { "value": "attributes.priority", "label": "Prioridad", "available": true, "type": "custom" }
]
```

---

### GET `/products/matrix?groupBy=owner_organization&outputId=uuid&organizationId=uuid&countryId=MX`

Matriz bidimensional de productos × indicadores.

**Permisos:** `product:read`  
**Query Params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `groupBy` | string | `owner_organization` | Eje Y. Valores: `owner_organization`, `responsible_member`, `country`, `attributes.<key>` |
| `outputId` | string | — | Filtrar por StrategicOutput UUID |
| `organizationId` | string | — | Filtrar por organización UUID |
| `countryId` | string | — | Filtrar por código ISO país |

**Response 200:**
```json
{
  "groupByField": { "value": "owner_organization", "label": "Organización Líder", "available": true },
  "indicators": [
    { "id": "uuid", "code": "1.1", "description": "Hectáreas reforestadas", "outputId": "uuid", "outputCode": "Output 1", "outputName": "Restauración" }
  ],
  "matrix": [
    [
      { "id": "uuid-org", "name": "ONG América" },
      {
        "indicator": { "id": "uuid", "code": "1.1", "..." : "..." },
        "group": { "id": "uuid-org", "name": "ONG América" },
        "products": [
          { "id": "uuid", "name": "Proyecto Reforestación", "deliveryDate": "2025-12-31", "ownerOrgName": "ONG América", "deliverable": "500 ha", "committedTarget": 100 }
        ]
      }
    ]
  ],
  "totalProducts": 15
}
```

---

## 15. Product Members

Prefijo: `/products/:productId/members` — Requiere header `x-tenant-id`

### POST `/products/:productId/members`

Agregar miembro al equipo del producto.

**Permisos:** `product_member:manage`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "memberId": "uuid-workspace-member",
  "role": "product_coordinator",
  "allocation": 80
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `memberId` | string | ✅ | `@IsUUID('4')` |
| `role` | ProductRole | ❌ | `product_coordinator`, `developer_worker`, `viewer` (default: `viewer`) |
| `allocation` | number | ❌ | 0-100 (porcentaje de dedicación) |

---

### GET `/products/:productId/members`

Listar equipo del producto.

**Permisos:** `product_member:read`  
**Response 200:**
```json
[
  {
    "id": "uuid",
    "productRole": "product_coordinator",
    "is_responsible": true,
    "allocation_percentage": 100,
    "member": {
      "id": "uuid",
      "full_name": "Juan Pérez",
      "email": "juan@example.com",
      "tenantRole": "general_coordinator"
    }
  }
]
```

---

## 16. Tasks

Prefijo: `/tasks` — Requiere header `x-tenant-id`

### POST `/tasks`

Crear tarea asignada a un producto.

**Permisos:** `task:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "title": "Preparar terreno zona norte",
  "description": "Limpieza y preparación del suelo",
  "productId": "uuid-producto",
  "assignedOrganizationId": "uuid-org",
  "phaseId": "uuid-catalog-item-phase",
  "statusId": "uuid-catalog-item-status",
  "assigneeMemberId": "uuid-product-member",
  "startDate": "2025-02-01",
  "endDate": "2025-03-01"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `title` | string | ✅ | `@IsNotEmpty` |
| `description` | string | ❌ | |
| `productId` | string | ✅ | `@IsUUID('4')` |
| `assignedOrganizationId` | string | ❌ | `@IsUUID('4')` |
| `phaseId` | string | ❌ | `@IsUUID('4')` — item del catálogo `TASK_PHASES` |
| `statusId` | string | ❌ | `@IsUUID('4')` — item del catálogo `TASK_STATUS` |
| `assigneeMemberId` | string | ❌ | `@IsUUID('4')` — miembro del producto |
| `startDate` | string | ❌ | ISO 8601 |
| `endDate` | string | ❌ | ISO 8601 |

---

### GET `/tasks/project/:productId?page=1&limit=10`

Listar tareas de un producto con paginación.

**Permisos:** `task:read`  
**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Preparar terreno zona norte",
      "description": "...",
      "start_date": "2025-02-01",
      "end_date": "2025-03-01",
      "actual_start_date": null,
      "actual_end_date": null,
      "created_at": "2025-01-15T00:00:00.000Z",
      "status": { "id": "uuid", "name": "To Do", "code": "TODO" },
      "phase": { "id": "uuid", "name": "Preparación", "code": "PREP" },
      "assignee": {
        "id": "uuid",
        "member": { "id": "uuid", "full_name": "Juan Pérez" }
      },
      "assignedOrganization": { "id": "uuid", "name": "ONG América" }
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 10
}
```

---

### PATCH `/tasks/:id/status`

Cambiar estatus de la tarea.

**Permisos:** `task:update_status`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{ "statusId": "uuid-catalog-item-new-status" }
```

---

### PATCH `/tasks/:id`

Actualizar tarea.

**Permisos:** `task:update`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "title": "Título actualizado",
  "description": "Nueva descripción",
  "statusId": "uuid",
  "phaseId": "uuid",
  "assigneeMemberId": "uuid",
  "assignedOrganizationId": "uuid",
  "startDate": "2025-02-01",
  "endDate": "2025-03-01",
  "actualStartDate": "2025-02-05",
  "actualEndDate": null
}
```

Todos los campos son opcionales.

---

## 17. Strategy

Prefijo: `/strategy` — Requiere header `x-tenant-id`

### POST `/strategy/outputs`

Crear output estratégico.

**Permisos:** `strategy:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "name": "Restauración de ecosistemas",
  "description": "Output dedicado a restauración",
  "order": 1
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `name` | string | ✅ | `@IsNotEmpty` |
| `description` | string | ❌ | |
| `order` | number | ✅ | `@IsInt`, `@Min(1)` |

---

### POST `/strategy/indicators`

Crear indicador estratégico dentro de un output.

**Permisos:** `strategy:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "outputId": "uuid-output",
  "indicatorNumber": 1,
  "description": "Hectáreas reforestadas",
  "unit": "hectáreas",
  "total_target": 5000,
  "plannedCompletionDate": "2026-12-31",
  "actualCompletionDate": null
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `outputId` | string | ✅ | `@IsUUID('4')` |
| `indicatorNumber` | number | ✅ | `@IsInt`, `@Min(1)` |
| `description` | string | ✅ | `@IsNotEmpty` |
| `unit` | string | ✅ | `@IsNotEmpty` |
| `total_target` | number | ✅ | `@Min(0)` |
| `plannedCompletionDate` | string | ❌ | ISO 8601 |
| `actualCompletionDate` | string | ❌ | ISO 8601 |

---

### POST `/strategy/assign`

Asignar un indicador a un producto con meta comprometida.

**Permisos:** `strategy:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "productId": "uuid-producto",
  "indicatorId": "uuid-indicador",
  "target": 500
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `productId` | string | ✅ | `@IsUUID` |
| `indicatorId` | string | ✅ | `@IsUUID` |
| `target` | number | ✅ | `@Min(0)` |

---

### POST `/strategy/report`

Reportar avance en un indicador de producto.

**Permisos:** `strategy:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "productStrategyId": "uuid-product-strategy",
  "value": 150,
  "date": "2025-06-30",
  "notes": "Reforestación completada zona A",
  "evidence_url": "https://example.com/evidence.pdf"
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `productStrategyId` | string | ✅ | `@IsUUID` |
| `value` | number | ✅ | |
| `date` | string | ✅ | ISO 8601 |
| `notes` | string | ❌ | |
| `evidence_url` | string | ❌ | `@IsUrl` |

---

### GET `/strategy/tree`

Árbol estratégico completo del workspace: outputs → indicators → contribuciones de productos.

**Permisos:** `strategy:read`  
**Response 200:**
```json
[
  {
    "id": "uuid",
    "code": "Output 1",
    "name": "Restauración de ecosistemas",
    "description": "...",
    "order": 1,
    "indicators": [
      {
        "id": "uuid",
        "code": "1.1",
        "description": "Hectáreas reforestadas",
        "unit": "hectáreas",
        "total_target": 5000,
        "planned_completion_date": "2026-12-31",
        "contributions": [
          {
            "id": "uuid",
            "committed_target": 500,
            "product": { "id": "uuid", "name": "Proyecto Reforestación" },
            "values": [
              { "id": "uuid", "value": 150, "date": "2025-06-30", "notes": "..." }
            ]
          }
        ]
      }
    ]
  }
]
```

---

### GET `/strategy/project/:productId`

Matriz estratégica de un producto específico.

**Permisos:** `strategy:read`

---

## 18. Check-Ins

Prefijo: `/checkins` — Requiere header `x-tenant-id`

### POST `/checkins`

Programar un check-in (reunión de seguimiento).

**Permisos:** `checkin:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{
  "title": "Revisión sprint 5",
  "topic": "Avance de reforestación zona norte",
  "scheduled_at": "2025-07-01T14:00:00Z",
  "productId": "uuid-producto",
  "organizerId": "uuid-product-member",
  "meeting_link": "https://meet.google.com/abc-def-ghi",
  "attendeeIds": ["uuid-pm-1", "uuid-pm-2"],
  "linkedTaskIds": ["uuid-task-1"]
}
```

**Validadores:**
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| `title` | string | ✅ | `@IsNotEmpty` |
| `topic` | string | ❌ | |
| `scheduled_at` | string | ✅ | ISO 8601 datetime |
| `productId` | string | ✅ | `@IsUUID('4')` |
| `organizerId` | string | ✅ | `@IsUUID('4')` — debe ser ProductMember |
| `meeting_link` | string | ❌ | |
| `attendeeIds` | string[] | ❌ | UUIDs de ProductMembers |
| `linkedTaskIds` | string[] | ❌ | UUIDs de Tasks |

---

### GET `/checkins/:id`

Obtener check-in por UUID con asistentes y tareas vinculadas.

**Permisos:** `checkin:read`

---

### PATCH `/checkins/:id/complete`

Completar check-in agregando notas de la reunión.

**Permisos:** `checkin:write`  
**Headers:** `x-csrf-token`  
**Body:**
```json
{ "notes": "Se acordó acelerar plantación en zona B. Próximo hito: 200 ha para agosto." }
```

---

## 19. Enums de Referencia

### GlobalRole
```
super_admin | user
```

### TenantRole
```
general_coordinator | member
```

### ProductRole
```
product_coordinator | developer_worker | viewer
```

### TenantStatus
```
ACTIVE | SUSPENDED | ARCHIVED
```

### CatalogType
```
TASK_STATUS | WORK_PACKAGES | TASK_PHASES
```

### Field Definition Types
```
TEXT | NUMBER | DATE | CATALOG_REF | BOOLEAN
```

### Permisos (28)
| Permiso | Descripción |
|---------|-------------|
| `member:manage` | Invitar/gestionar miembros del workspace |
| `member:read` | Ver lista de miembros |
| `organization:manage` | Crear/vincular organizaciones |
| `organization:read` | Ver organizaciones del workspace |
| `field_def:write` | Crear/editar/eliminar campos custom |
| `field_def:read` | Ver campos custom |
| `catalog:read` | Ver catálogos |
| `catalog:write` | Crear catálogos |
| `product:write` | Crear productos |
| `product:read` | Ver productos |
| `product:update` | Actualizar productos |
| `product_member:manage` | Agregar miembros a productos |
| `product_member:read` | Ver equipo del producto |
| `task:write` | Crear tareas |
| `task:read` | Ver tareas |
| `task:update` | Actualizar tareas |
| `task:update_status` | Cambiar estatus de tarea |
| `task:assign` | Asignar tareas |
| `task:delete` | Eliminar tareas |
| `strategy:write` | Crear outputs/indicadores/reportar avance |
| `strategy:read` | Ver árbol estratégico |
| `checkin:write` | Crear/completar check-ins |
| `checkin:read` | Ver check-ins |

---

## Notas Generales para Implementación Frontend

### Headers Requeridos

```typescript
// Toda petición autenticada envía cookies automáticamente
const headers = {
  'Content-Type': 'application/json',
  'x-csrf-token': getCsrfTokenFromCookie('__csrf'), // Requerido en mutaciones
  'x-tenant-id': 'slug-del-workspace',               // Solo para endpoints App Plane
};
```

### Manejo de Errores

Todos los endpoints usan el formato consistente:
```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

O para errores de validación (class-validator):
```json
{
  "statusCode": 400,
  "message": ["email must be an email", "firstName should not be empty"],
  "error": "Bad Request"
}
```

### Paginación

Los endpoints paginados aceptan `?page=N&limit=M` y devuelven:
```json
{
  "items": [...],       // o "data" en tasks
  "total": 100,
  "page": 1,
  "limit": 10,
  "totalPages": 10      // presente en la mayoría
}
```

### Flujo de Autenticación

1. `POST /auth/login` → cookie `connect.sid` se establece
2. Si `mustChangePassword: true` → redirigir a cambio de contraseña
3. `GET /auth/my-workspaces` → seleccionar workspace
4. Establecer header `x-tenant-id: <slug>` para todas las peticiones al App Plane
5. `GET /setup/status` → verificar si el workspace necesita configuración inicial

### CSRF Token

1. La cookie `__csrf` se establece automáticamente al hacer login
2. En cada mutación (POST/PUT/PATCH/DELETE), enviar el valor como header `x-csrf-token`
3. Extraer con: `document.cookie.match(/__csrf=([^;]+)/)?.[1]`
