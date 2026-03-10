import { 
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn, JoinColumn 
} from 'typeorm';
import { ProductStrategy } from '../../strategy/entities/product-strategy.entity';
import { ProductMember } from './product-member.entity';
import { ProductCustomValue } from './product-custom-value.entity';
import { WorkspaceOrganization } from '../../organizations/entities/workspace-organization.entity';
import { Country } from './country.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 1. CAMPOS BASE
  @Column()
  name: string; // "Product Name"

  @Column({ type: 'text', nullable: true })
  objective: string; // "Product Objective"

  @Column({ type: 'text', nullable: true })
  description: string; // Resumen general

  @Column({ type: 'text', nullable: true })
  methodology: string; // "Methodology Description"

  @Column({ nullable: true })
  deliverable: string; // "Deliverable" (String corto, ej: "Informe Técnico")

  @Column({ type: 'date', nullable: true })
  delivery_date: Date; // "Delivery Date"

  // 2. RELACIÓN: OWNER (Organización Líder)
  // Un proyecto tiene UNA organización dueña
  @ManyToOne(() => WorkspaceOrganization, { nullable: true }) 
  @JoinColumn({ name: 'owner_organization_id' })
  ownerOrganization: WorkspaceOrganization;

  @Column({ name: 'owner_organization_id', nullable: true })
  ownerOrganizationId: string;

  // 3b. RELACIÓN: PAÍS (Diccionario ISO 3166-1 alpha-2)
  @ManyToOne(() => Country, { nullable: true, eager: true })
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @Column({ name: 'country_id', type: 'varchar', length: 2, nullable: true })
  countryId: string;

  // 4. RELACIÓN: OTHER ORGANIZATIONS (Socios)
  // Un proyecto tiene MUCHAS organizaciones participantes
  @ManyToMany(() => WorkspaceOrganization)
  @JoinTable({
    name: 'product_participating_organizations', // Tabla pivote automática
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'organization_id', referencedColumnName: 'id' }
  })
  participatingOrganizations: WorkspaceOrganization[];

  // ****** RELACIÓN: MIEMBROS DEL PRODUCTO
  @OneToMany(() => ProductMember, (member) => member.product, { cascade: true })
  members: ProductMember[];

  // 5. RELACIÓN CON ESTRATEGIA (Indicadores)
  // Esta es la que ya tenías. Aquí vive el vínculo con el Output indirectamente.
  @OneToMany(() => ProductStrategy, (strategy) => strategy.product)
  strategies: ProductStrategy[];

  // 6. RELACIÓN: CUSTOM VALUES (EAV)
  @OneToMany(() => ProductCustomValue, (cv) => cv.product, { cascade: true })
  customValues: ProductCustomValue[];

  // 7. CAMPOS VARIABLES (JSONB) — LEGACY: archivo muerto, no se lee ni escribe.
  //    La columna física permanece en PostgreSQL para auditoría histórica,
  //    pero queda excluida de las consultas TypeORM (select: false).
  @Column({ type: 'jsonb', default: {}, select: false })
  attributes: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
