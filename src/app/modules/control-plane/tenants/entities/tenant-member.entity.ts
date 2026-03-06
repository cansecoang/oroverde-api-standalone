import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, CreateDateColumn, Unique } from 'typeorm';
import { GlobalUser } from '../../users/entities/user.entity';
import { Tenant } from './tenant.entity';

@Entity('tenant_members')
@Unique(['userId', 'tenantId'])
export class TenantMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => GlobalUser, (user) => user.tenants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: GlobalUser;

  @Index()
  @Column()
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @CreateDateColumn()
  joinedAt: Date;
}