// =========================================================
// 🏢 TENANT ROLES (Nivel Workspace)
// =========================================================
export enum TenantRole {
  GENERAL_COORDINATOR = 'general_coordinator',
  MEMBER = 'member',
}

// =========================================================
// 📦 PRODUCT ROLES (Nivel Producto)
// =========================================================
export enum ProductRole {
  PRODUCT_COORDINATOR = 'product_coordinator',
  DEVELOPER_WORKER = 'developer_worker',
  VIEWER = 'viewer',
}

// =========================================================
// 🔑 PERMISSIONS (Acciones Granulares)
// =========================================================
export enum Permission {
  // --- Members (Workspace) ---
  MEMBER_MANAGE = 'member:manage',
  MEMBER_READ = 'member:read',

  // --- Organizations ---
  ORGANIZATION_MANAGE = 'organization:manage',
  ORGANIZATION_READ = 'organization:read',

  // --- Fields ---
  FIELD_DEF_WRITE = 'field_def:write',
  FIELD_DEF_READ = 'field_def:read',

  // --- Catalog ---
  CATALOG_READ = 'catalog:read',
  CATALOG_WRITE = 'catalog:write',

  // --- Producto ---
  PRODUCT_WRITE = 'product:write',       // crear/actualizar producto (general_coordinator y product_coordinator con membresía)
  PRODUCT_READ = 'product:read',         // listar / ver productos
  PRODUCT_UPDATE = 'product:update',     // modificar producto

  // --- Solicitudes de Creación de Producto ---
  PRODUCT_REQUEST_WRITE = 'product_request:write',   // DEVELOPER_WORKER envía solicitud de creación
  PRODUCT_REQUEST_REVIEW = 'product_request:review', // GC / PC revisa solicitudes

  // --- Miembros de Producto ---
  PRODUCT_MEMBER_MANAGE = 'product_member:manage',  // agregar/quitar miembros de producto
  PRODUCT_MEMBER_READ = 'product_member:read',       // ver equipo de producto

  // --- Tareas ---
  TASK_WRITE = 'task:write',                // crear tarea
  TASK_READ = 'task:read',                  // ver tareas
  TASK_UPDATE = 'task:update',              // editar tarea (datos)
  TASK_UPDATE_STATUS = 'task:update_status', // cambiar estado de tarea
  TASK_ASSIGN = 'task:assign',              // asignar tarea a miembro
  TASK_DELETE = 'task:delete',              // eliminar tarea

  // --- Strategy ---
  STRATEGY_GLOBAL_WRITE = 'strategy:global_write', // crear outputs e indicadores (solo GENERAL_COORDINATOR)
  STRATEGY_WRITE = 'strategy:write',   // asignar indicador a producto, reportar avance, actualizar meta
  STRATEGY_READ = 'strategy:read',     // ver árbol estratégico

  // --- Check-ins ---
  CHECKIN_WRITE = 'checkin:write',     // programar / completar check-in
  CHECKIN_READ = 'checkin:read',       // ver check-ins
}

// =========================================================
// 🏢 TenantACL (Matriz de Acceso para Roles de Workspace)
// =========================================================
// GENERAL_COORDINATOR tiene GOD MODE en el guard, así que solo necesitamos MEMBER.
export const TenantACL: Record<TenantRole, Permission[]> = {
  [TenantRole.GENERAL_COORDINATOR]: [], // bypass — nunca se consulta
  [TenantRole.MEMBER]: [
    // Workspace reads
    Permission.MEMBER_READ,
    Permission.ORGANIZATION_READ,
    Permission.CATALOG_READ,
    Permission.FIELD_DEF_READ,
    // Producto reads (listados globales sin productId)
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MEMBER_READ,
    // Strategy reads (árbol global sin productId)
    Permission.STRATEGY_READ,
    // Check-in reads
    Permission.CHECKIN_READ,
  ],
};

// =========================================================
// 🛡️ ProductACL (Matriz de Acceso para Roles de Producto)
// =========================================================
export const ProductACL: Record<ProductRole, Permission[]> = {
  [ProductRole.PRODUCT_COORDINATOR]: [
    // Producto
    Permission.PRODUCT_READ,
    Permission.PRODUCT_UPDATE,
    // Solicitudes de creación
    Permission.PRODUCT_REQUEST_REVIEW,
    // Miembros de producto
    Permission.PRODUCT_MEMBER_MANAGE,
    Permission.PRODUCT_MEMBER_READ,
    // Tareas — control total
    Permission.TASK_WRITE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_UPDATE_STATUS,
    Permission.TASK_ASSIGN,
    Permission.TASK_DELETE,
    // Strategy
    Permission.STRATEGY_WRITE,
    Permission.STRATEGY_READ,
    // Check-ins
    Permission.CHECKIN_WRITE,
    Permission.CHECKIN_READ,
  ],
  [ProductRole.DEVELOPER_WORKER]: [
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MEMBER_READ,
    // Tareas — developer puede crear, editar y cambiar estado
    Permission.TASK_WRITE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.TASK_UPDATE_STATUS,
    Permission.STRATEGY_READ,
    Permission.CHECKIN_READ,
    // Solicitudes de creación
    Permission.PRODUCT_REQUEST_WRITE,
  ],
  [ProductRole.VIEWER]: [
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MEMBER_READ,
    Permission.TASK_READ,
    Permission.STRATEGY_READ,
    Permission.CHECKIN_READ,
  ],
};
