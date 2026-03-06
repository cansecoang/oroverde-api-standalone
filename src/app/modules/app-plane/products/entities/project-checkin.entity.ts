import { 
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, ManyToMany, JoinTable, JoinColumn, CreateDateColumn, UpdateDateColumn, Index 
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { ProductMember } from '../../products/entities/product-member.entity';
import { Task } from '../../tasks/entities/task.entity';

@Entity('project_checkins')
export class ProjectCheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string; // Ej: "Daily Standup - Equipo Backend"

  @Column({ type: 'text', nullable: true })
  topic: string; // Ej: "Revisión de bloqueos en módulo de Pagos"

  @Column({ type: 'timestamptz' })
  scheduled_at: Date; // Fecha y hora agendada (UTC-aware)

  @Column({ type: 'text', nullable: true })
  meeting_link: string; // Zoom, Google Meet, Teams

  // 📝 RESULTADOS (Se llena al finalizar la reunión)
  @Column({ type: 'text', nullable: true })
  notes: string; // Minuta / Acuerdos

  @Column({ default: false })
  is_completed: boolean;

  // --- 🔗 RELACIONES ---

  // 1. EL PROYECTO
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Index()
  @Column({ name: 'product_id' })
  productId: string;

  // 2. EL ORGANIZADOR (Quien convoca)
  @ManyToOne(() => ProductMember, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organizer_id' })
  organizer: ProductMember;

  @Index()
  @Column({ name: 'organizer_id' })
  organizerId: string;

  // 3. 👥 ASISTENTES INVITADOS (Muchos miembros en muchas reuniones)
  // TypeORM creará la tabla 'checkin_attendees' automáticamente
  @ManyToMany(() => ProductMember)
  @JoinTable({
    name: 'checkin_attendees_pivot', // Nombre de la tabla intermedia
    joinColumn: { name: 'checkin_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'member_id', referencedColumnName: 'id' }
  })
  attendees: ProductMember[];

  // 4. ✅ TAREAS A DISCUTIR (El contexto de la reunión)
  // TypeORM creará la tabla 'checkin_linked_tasks' automáticamente
  @ManyToMany(() => Task)
  @JoinTable({
    name: 'checkin_linked_tasks_pivot', // Nombre de la tabla intermedia
    joinColumn: { name: 'checkin_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'task_id', referencedColumnName: 'id' }
  })
  linkedTasks: Task[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}