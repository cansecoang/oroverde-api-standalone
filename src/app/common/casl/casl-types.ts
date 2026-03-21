import { MongoAbility, ForcedSubject } from '@casl/ability';

// ─── Subject names ────────────────────────────────────────────────────────────
export type AppSubjectNames =
  | 'Product'
  | 'Task'
  | 'Strategy'
  | 'CheckIn'
  | 'ProductRequest'
  | 'ProductMember'
  | 'WorkspaceMember'
  | 'Catalog'
  | 'FieldDefinition';

// ─── Subjects ─────────────────────────────────────────────────────────────────
// Incluye tanto strings literales como objetos con ForcedSubject para que
// subject('Product', { id }) sea assignable al tipo AppAbility.can().
// Record<string, any> (no unknown) es necesario porque los objetos devueltos
// por subject() no tienen index signature, y any es bi-direccional en TS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSubjects =
  | AppSubjectNames
  | (Record<string, any> & ForcedSubject<AppSubjectNames>)
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
