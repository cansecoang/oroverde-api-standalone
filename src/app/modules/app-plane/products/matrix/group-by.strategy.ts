/**
 * GroupByStrategy — Patrón de estrategia para construir
 * los SQL fragments dinámicos del eje Y de la Product Matrix.
 *
 * Cada estrategia define:
 *  - selectGroup: expresiones SQL para group_id y group_name
 *  - joinClause:  JOINs necesarios para resolver el grupo
 *  - orderBy:     columna de ordenamiento
 *  - label:       texto visible en el dropdown "Group by"
 */

export interface GroupByStrategy {
  /** SQL: "alias.id as group_id, alias.name as group_name" */
  selectGroup: string;
  /** SQL: "JOIN ... ON ..." */
  joinClause: string;
  /** SQL: columna para ORDER BY */
  orderBy: string;
  /** Etiqueta UI del dropdown */
  label: string;
}

// ── Estrategias base (campos fijos en Product) ─────────────────────────

const BASE_STRATEGIES: Record<string, GroupByStrategy> = {
  owner_organization: {
    selectGroup: 'wo.id as group_id, wo.name as group_name',
    joinClause:
      'JOIN workspace_organizations wo ON p.owner_organization_id = wo.id',
    orderBy: 'wo.name',
    label: 'Organization',
  },
  responsible_member: {
    selectGroup: 'wm.id as group_id, wm.full_name as group_name',
    joinClause:
      'JOIN product_members pm_resp ON pm_resp.product_id = p.id AND pm_resp.is_responsible = true\n      JOIN workspace_members wm ON pm_resp.member_id = wm.id',
    orderBy: 'wm.full_name',
    label: 'Responsible',
  },
  country: {
    selectGroup: 'c.id as group_id, c.name as group_name',
    joinClause: `JOIN countries c ON p.country_id = c.id`,
    orderBy: 'c.name',
    label: 'Country',
  },
};

// ── Estrategias dinámicas (attributes JSONB) ───────────────────────────

/**
 * Construye una estrategia para un campo `attributes.{key}`.
 *
 * Si el campo es CATALOG_REF → JOIN catalog_items para obtener el nombre.
 * Si es TEXT/NUMBER/etc → el valor raw del JSONB es grupo.
 */
export function buildAttributeStrategy(
  key: string,
  label: string,
  isCatalogRef: boolean,
): GroupByStrategy {
  if (isCatalogRef) {
    return {
      selectGroup: `ci_attr.id as group_id, ci_attr.name as group_name`,
      joinClause: `JOIN catalog_items ci_attr ON (p.attributes->>'${key}')::uuid = ci_attr.id`,
      orderBy: 'ci_attr.name',
      label,
    };
  }

  return {
    selectGroup: `p.attributes->>'${key}' as group_id, p.attributes->>'${key}' as group_name`,
    joinClause: '',
    orderBy: `p.attributes->>'${key}'`,
    label,
  };
}

// ── Resolver ───────────────────────────────────────────────────────────

/**
 * Resuelve la estrategia GroupBy completa dado un valor de `groupBy`.
 *
 * @param groupBy - "owner_organization" | "responsible_member" | "country" | "attributes.{key}"
 * @param fieldDefinitions - Map de key → { label, type, linkedCatalogCode }
 *                           obtenido de ProductFieldDefinition
 * @returns GroupByStrategy | null si el valor no es válido
 */
export function resolveGroupByStrategy(
  groupBy: string,
  fieldDefinitions: Map<
    string,
    { label: string; type: string; linkedCatalogCode: string | null }
  >,
): GroupByStrategy | null {
  // 1. Estrategia base
  if (BASE_STRATEGIES[groupBy]) {
    return BASE_STRATEGIES[groupBy];
  }

  // 2. Estrategia de atributo custom
  if (groupBy.startsWith('attributes.')) {
    const key = groupBy.replace('attributes.', '');
    const def = fieldDefinitions.get(key);
    if (!def) return null;

    return buildAttributeStrategy(
      key,
      def.label,
      def.type === 'CATALOG_REF',
    );
  }

  return null;
}

/**
 * Devuelve las claves base disponibles (para saber qué mostrar en el dropdown).
 */
export function getBaseStrategyKeys(): string[] {
  return Object.keys(BASE_STRATEGIES);
}

export function getBaseStrategyLabel(key: string): string | null {
  return BASE_STRATEGIES[key]?.label ?? null;
}
