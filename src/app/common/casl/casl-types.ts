import { MongoAbility } from '@casl/ability';

// ─── Subjects ────────────────────────────────────────────────────────────────
// Strings literales — sin dependencias circulares con las entidades TypeORM.
export type AppSubjects =
  | 'Product'
  | 'Task'
  | 'Strategy'
  | 'CheckIn'
  | 'ProductRequest'
  | 'ProductMember'
  | 'WorkspaceMember'
  | 'Catalog'
  | 'FieldDefinition'
  | 'all';

// ─── Actions ─────────────────────────────────────────────────────────────────
export type AppActions =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'        // shorthand CASL: cubre cualquier acción
  | 'updateStatus'  // específico de Task
  | 'assign'        // específico de Task
  | 'write'         // Strategy: reportar avance / asignar indicador
  | 'globalWrite'   // Strategy: crear outputs e indicadores (solo GENERAL_COORDINATOR)
  | 'review';       // ProductRequest: revisar solicitudes

// ─── AppAbility ──────────────────────────────────────────────────────────────
export type AppAbility = MongoAbility<[AppActions, AppSubjects]>;
