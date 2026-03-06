import { DataSource } from 'typeorm';

/**
 * Token de inyección para el callback de inicialización del tenant.
 *
 * Permite que TenantsService (control-plane) ejecute lógica de seed
 * del app-plane SIN importar directamente módulos de negocio.
 *
 * Proveer este token en AppModule (o en AppPlaneModule):
 *   { provide: TENANT_SEED_CALLBACK, useValue: seedDefaultCatalogs }
 */
export const TENANT_SEED_CALLBACK = Symbol('TENANT_SEED_CALLBACK');

export type TenantSeedCallback = (connection: DataSource) => Promise<void>;
