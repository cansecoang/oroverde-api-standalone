import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Product } from './product.entity'; 
import { ProductRole } from '../../../../common/enums/business-roles.enum';
// 👇 Importamos al Miembro del Tenant
import { WorkspaceMember } from '../../members/entities/workspace-member.entity';

@Entity('product_members')
// Aseguramos que un miembro no esté duplicado en el mismo proyecto
@Index(['product', 'member'], { unique: true }) 
export class ProductMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔗 RELACIÓN CON EL MIEMBRO DEL WORKSPACE
  // En lugar de ir al GlobalUser, vamos al perfil local
  @ManyToOne(() => WorkspaceMember, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: WorkspaceMember;

  @Column({ name: 'member_id' })
  memberId: string;

  // 📦 RELACIÓN CON EL PRODUCTO
  @ManyToOne(() => Product, (product) => product.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  // 🎭 ROL EN ESTE PROYECTO ESPECÍFICO
  // Puede ser 'Viewer' aquí, aunque sea 'Admin' en el tenant
  @Column({
    type: 'enum',
    enum: ProductRole,
    default: ProductRole.VIEWER
  })
  productRole: ProductRole;

  // ¿Es el responsable principal del producto?
  @Column({ name: 'is_responsible', type: 'boolean', default: false })
  isResponsible: boolean;

  // Opcional: Horas asignadas, dedicación, etc.
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  allocation_percentage: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}