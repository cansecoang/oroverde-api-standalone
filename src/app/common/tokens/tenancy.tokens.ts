// ─── Injection tokens para tenancy ────────────────────────────────────

/** Provee la implementación de ITenantConnection (TenantConnectionService) */
export const TENANT_CONNECTION_TOKEN = Symbol('TENANT_CONNECTION_TOKEN');

/** Provee la clase entidad WorkspaceMember (EntityTarget) */
export const WORKSPACE_MEMBER_ENTITY = Symbol('WORKSPACE_MEMBER_ENTITY');

/** Provee la clase entidad ProductMember (EntityTarget) */
export const PRODUCT_MEMBER_ENTITY = Symbol('PRODUCT_MEMBER_ENTITY');
