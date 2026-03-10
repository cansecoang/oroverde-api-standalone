import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductFieldDefinition } from '../../field-definitions/entities/product-field-definition.entity';
import { CatalogItem } from '../../catalogs/entities/catalog-item.entity';

/**
 * ProductCustomValue
 * ─────────────────────────────────────────────────────────────────
 * Tabla pivote unificada para TODOS los valores de campos custom.
 *
 * Reemplaza el almacenamiento en products.attributes (JSONB) con
 * filas tipadas que tienen integridad referencial.
 *
 * Columnas de valor (mutuamente excluyentes por fila):
 *   - value_text   → textos libres, números como string, fechas, booleans
 *   - value_catalog_id → FK estable a catalog_items
 *
 * Constraint UNIQUE(product_id, field_id) garantiza un solo valor
 * por campo por producto.
 * ─────────────────────────────────────────────────────────────────
 */
@Entity('product_custom_values')
@Unique('uq_product_field', ['productId', 'fieldId'])
export class ProductCustomValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ──── Foreign Keys ────────────────────────────────────────────

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'field_id', type: 'uuid' })
  fieldId: string;

  // ──── Columnas de valor (mutuamente excluyentes) ──────────────

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText: string | null;

  @Column({ name: 'value_catalog_id', type: 'uuid', nullable: true })
  valueCatalogId: string | null;

  // ──── Timestamps ──────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ──── Relaciones ──────────────────────────────────────────────

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => ProductFieldDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'field_id' })
  fieldDefinition: ProductFieldDefinition;

  @ManyToOne(() => CatalogItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'value_catalog_id' })
  catalogItem: CatalogItem;
}
