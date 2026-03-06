import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { CatalogItem } from './catalog-item.entity';

@Entity('catalogs')
export class Catalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // Ej: 'WORK_PACKAGES', 'COUNTRIES'

  @Column()
  name: string; // Ej: 'Paquetes de Trabajo'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @OneToMany(() => CatalogItem, (item) => item.catalog, { cascade: true })
  items: CatalogItem[];

  @CreateDateColumn()
  createdAt: Date;
}
