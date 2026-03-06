import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { WorkspaceMember } from '../../members/entities/workspace-member.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ¿Quién lo hizo? (ID local del miembro dentro del tenant)
  @ManyToOne(() => WorkspaceMember, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_member_id' })
  actorMember: WorkspaceMember;

  @Index()
  @Column({ name: 'actor_member_id', nullable: true })
  actorMemberId: string; 

  // ¿Qué hizo?
  @Column()
  action: string; // CREATE, UPDATE, DELETE, EXPORT

  // ¿Sobre qué lo hizo?
  @Column()
  entity: string; // PRODUCT, TASK, FIELD_DEFINITION

  @Index()
  @Column({ name: 'entity_id' })
  entityId: string; // El UUID del producto/tarea afectado

  // 🕵️‍♀️ LA EVIDENCIA FORENSE
  // Guardamos qué cambió. Ej: { "status": { "old": "TODO", "new": "DONE" } }
  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any>;

  @Column({ nullable: true })
  ip_address: string;

  @Column({ nullable: true })
  user_agent: string;

  @CreateDateColumn()
  performed_at: Date;
}