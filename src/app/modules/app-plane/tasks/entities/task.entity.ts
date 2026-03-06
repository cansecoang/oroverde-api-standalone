import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { CatalogItem } from '../../catalogs/entities/catalog-item.entity';
import { ProductMember } from '../../products/entities/product-member.entity';
import { WorkspaceOrganization } from '../../organizations/entities/workspace-organization.entity';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // --- 🔗 RELACIONES DE NEGOCIO ---

  // 1. Producto al que pertenece
  @Column({ name: 'product_id' })
  @Index()
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // 2. Organización Asignada (Participante del proyecto)
  @ManyToOne(() => WorkspaceOrganization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_organization_id' })
  assignedOrganization: WorkspaceOrganization;

  @Column({ name: 'assigned_organization_id', nullable: true })
  assignedOrganizationId: string;

  // --- ⚙️ CATALOGOS CONFIGURABLES ---

  // 3. Fase
  @Column({ name: 'phase_id', nullable: true })
  @Index()
  phaseId: string;

  @ManyToOne(() => CatalogItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'phase_id' })
  phase: CatalogItem;

  // 4. Estatus
  @Column({ name: 'status_id', nullable: true })
  @Index()
  statusId: string;

  @ManyToOne(() => CatalogItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'status_id' })
  status: CatalogItem;

  // --- 📅 GESTIÓN DE TIEMPOS (Plan vs Real) ---

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate: Date; // Fecha Planeada Inicio

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate: Date;   // Fecha Planeada Fin

  @Column({ name: 'actual_start_date', type: 'timestamptz', nullable: true })
  actualStartDate: Date; // Lo que realmente ocurrió

  @Column({ name: 'actual_end_date', type: 'timestamptz', nullable: true })
  actualEndDate: Date;   // Cuando realmente terminó

  // --- 👤 RESPONSABLE (Assignee) ---
  // Debe ser alguien QUE YA ESTÉ en el equipo del producto (ID local de ProductMember)
  @ManyToOne(() => ProductMember, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_member_id' })
  assignee: ProductMember;

  @Column({ name: 'assignee_member_id', nullable: true })
  assigneeMemberId: string;
  
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}