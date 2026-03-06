/**
 * APP_PLANE_ENTITIES — Tipo auxiliar para el token de inyección.
 *
 * El arreglo concreto de entidades vive en apps/api para evitar
 * una dependencia circular (lib → app → lib).
 * Consultar: apps/api/src/app/modules/app-plane/app-plane-entities.ts
 */
export type AppPlaneEntityList = readonly (new () => object)[];
