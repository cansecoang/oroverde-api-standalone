import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantRole } from '../../../../common/enums/business-roles.enum';
// 👇 IMPORTAR LA ORGANIZACIÓN LOCAL
import { WorkspaceOrganization } from '../../organizations/entities/workspace-organization.entity';

@Entity('workspace_members')
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  // 👇 CAMPOS DE CACHÉ VISUAL (Para no hacer JOIN con la BD Global en cada lista)
  @Column()
  email: string;

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  // 👇 3. LA AFILIACIÓN LOCAL
  // "En este tenant, este usuario trabaja para..."
  @ManyToOne(() => WorkspaceOrganization)
  @JoinColumn({ name: 'organization_id' })
  organization: WorkspaceOrganization;

  @Index()
  @Column({ name: 'organization_id', nullable: true })
  organizationId: string;

  @Column({
    type: 'enum',
    enum: TenantRole,
    default: TenantRole.MEMBER 
  })
  tenantRole: TenantRole; 

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}