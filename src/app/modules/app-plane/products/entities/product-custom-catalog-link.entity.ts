import { Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Product } from './product.entity';
import { ProductFieldDefinition } from '../../field-definitions/entities/product-field-definition.entity';
import { CatalogItem } from '../../catalogs/entities/catalog-item.entity';

/**
 * ProductCustomCatalogLink
 * ─────────────────────────────────────────────────────────────────
 * Tabla pivote dinámica para campos custom de tipo CATALOG_MULTI.
 * 
 * Vincula un Producto con múltiples CatalogItems para un campo
 * definido en product_field_definitions.
 * 
 * Llave primaria compuesta: (product_id, field_definition_id, catalog_item_id)
 * ─────────────────────────────────────────────────────────────────
 */
@Entity('product_custom_catalog_links')
export class ProductCustomCatalogLink {
  // ──── PK compuesta ────────────────────────────────────────────

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string;

  @PrimaryColumn({ name: 'field_definition_id', type: 'uuid' })
  fieldDefinitionId: string;

  @PrimaryColumn({ name: 'catalog_item_id', type: 'uuid' })
  catalogItemId: string;

  // ──── Relaciones ──────────────────────────────────────────────

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => ProductFieldDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_definition_id' })
  fieldDefinition: ProductFieldDefinition;

  @ManyToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem: CatalogItem;
}
