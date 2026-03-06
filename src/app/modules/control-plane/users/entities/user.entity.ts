import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { GlobalOrganization } from '../../organizations/entities/global-organization.entity';
import { TenantMember } from '../../tenants/entities/tenant-member.entity';

// 👇 1. IMPORTAR EL ENUM GLOBAL
// Ajusta la cantidad de '../' según tu estructura real, pero suele ser algo así:
import { GlobalRole } from '../../../../common/enums/global-roles.enum';

@Entity('users')
export class GlobalUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ select: false }) 
  password_hash: string;

  // 👇 2. NUEVA COLUMNA: ROL DE PLATAFORMA
  // Define si puedes crear Tenants (Super Admin) o no (User).
  @Column({
    type: 'enum',
    enum: GlobalRole,
    default: GlobalRole.USER // Por defecto: Nadie nace siendo Super Admin
  })
  globalRole: GlobalRole;

  // 🏢 TU EMPLEADOR (Identidad Legal)  
  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => GlobalOrganization)
  @JoinColumn({ name: 'organization_id' })
  organization: GlobalOrganization;  

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: true })
  mustChangePassword: boolean;

  @Column({ nullable: true, select: false }) 
  activationToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  activationTokenExpiry: Date;

  @Column({ nullable: true, select: false })
  resetCode: string;

  @Column({ type: 'timestamptz', nullable: true })
  resetCodeExpiry: Date;

  @Column({ nullable: true, select: false })
  resetToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  resetTokenExpiry: Date;

  // 🏠 LISTA DE ACCESO (Tenants permitidos)
  @OneToMany(() => TenantMember, member => member.user)
  tenants: TenantMember[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}