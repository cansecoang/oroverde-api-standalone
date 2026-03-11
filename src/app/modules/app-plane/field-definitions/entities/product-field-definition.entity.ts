import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Catalog } from '../../catalogs/entities/catalog.entity';

@Entity('product_field_definitions')
export class ProductFieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // El "slug" del campo en el JSON del Proyecto
  // Ej: 'project_budget', 'soil_type'
  @Column({ unique: true })
  key: string; 

  // La etiqueta humana para el formulario de "Nuevo Proyecto"
  // Ej: 'Presupuesto Total', 'Tipo de Suelo'
  @Column()
  label: string; 

  // Tipos soportados: 'TEXT', 'NUMBER', 'DATE', 'CATALOG_REF', 'BOOLEAN'
  @Column()
  type: string; 

  // LEGACY: se mantiene por compatibilidad con el frontend.
  // La relación fuerte es linkedCatalogId (FK → catalogs.id).
  @Column({ name: 'linked_catalog_code', nullable: true })
  linkedCatalogCode: string;

  // FK fuerte hacia catalogs.id (reemplaza el vínculo débil por texto)
  @Column({ name: 'linked_catalog_id', type: 'uuid', nullable: true })
  linkedCatalogId: string | null;

  @ManyToOne(() => Catalog, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_catalog_id' })
  linkedCatalog?: Catalog | null;

  @Column({ default: false })
  required: boolean;

  @Column({ default: 0 })
  order: number; // Para que el formulario del proyecto salga ordenado

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}