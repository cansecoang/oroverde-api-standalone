import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  // 👇 VITAL: Si type es 'CATALOG_REF', aquí guardamos qué catálogo cargar
  // Ej: 'SOIL_TYPES_CAT'
  @Column({ name: 'linked_catalog_code', nullable: true })
  linkedCatalogCode: string;

  @Column({ default: false })
  required: boolean;

  @Column({ default: 0 })
  order: number; // Para que el formulario del proyecto salga ordenado

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}