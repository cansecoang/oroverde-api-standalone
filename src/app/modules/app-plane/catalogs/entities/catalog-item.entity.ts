import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { Catalog } from './catalog.entity';

@Entity('catalog_items')
@Unique(['catalogId', 'code'])
export class CatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Ej: 'WP-01 Infraestructura'

  @Column({ nullable: true })
  code: string; // Ej: 'WP-01'

  @Column({ name: 'display_order', default: 0 })
  order: number;

  @Index()
  @Column({ name: 'catalog_id' })
  catalogId: string;

  @ManyToOne(() => Catalog, (catalog) => catalog.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalog_id' })
  catalog: Catalog;
}
