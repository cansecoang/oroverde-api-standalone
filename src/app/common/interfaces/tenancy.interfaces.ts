import { DataSource } from 'typeorm';

// ─── Interfaz del servicio de conexión por tenant ───────────────────────────
// Permite inyectar TenantConnectionService sin importar la clase concreta.
export interface ITenantConnection {
  getTenantConnection(): Promise<DataSource>;
}

// ─── Shapes mínimas para type-safety en HybridPermissionsGuard ──────────────
// Evitan importar las entidades concretas (que viven en apps/api).

export interface IWorkspaceMember {
  id: string;
  userId: string;
  tenantRole: string;
}

export interface IProductMember {
  id: string;
  memberId: string;
  productId: string;
  productRole: string;
}
