import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn, Index } from 'typeorm';
import { Product } from './product.entity';
import { ProductFieldDefinition } from '../../field-definitions/entities/product-field-definition.entity';
import { WorkspaceOrganization } from '../../organizations/entities/workspace-organization.entity';

/**
 * ProductCustomOrgLink
 * ─────────────────────────────────────────────────────────────────
 * Tabla pivote dinámica para campos custom de tipo ORG_MULTI.
 * 
 * Vincula un Producto con múltiples WorkspaceOrganizations para un
 * campo definido en product_field_definitions.
 * 
 * Llave primaria compuesta: (product_id, field_definition_id, organization_id)
 * ─────────────────────────────────────────────────────────────────
 */
@Entity('product_custom_org_links')
export class ProductCustomOrgLink {
  // ──── PK compuesta ────────────────────────────────────────────

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string;

  @PrimaryColumn({ name: 'field_definition_id', type: 'uuid' })
  fieldDefinitionId: string;

  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  // ──── Relaciones ──────────────────────────────────────────────

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => ProductFieldDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_definition_id' })
  fieldDefinition: ProductFieldDefinition;

  @ManyToOne(() => WorkspaceOrganization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: WorkspaceOrganization;
}
