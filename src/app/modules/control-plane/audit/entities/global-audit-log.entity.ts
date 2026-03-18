import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('global_audit_logs')
export class GlobalAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'actor_user_id', nullable: true, type: 'uuid' })
  actorUserId: string | null;

  @Column()
  action: string; // CREATE | UPDATE | DELETE

  @Column()
  entity: string; // USER | TENANT | ORGANIZATION

  @Index()
  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any> | null;

  @Index()
  @CreateDateColumn({ name: 'performed_at', type: 'timestamptz' })
  performedAt: Date;
}
