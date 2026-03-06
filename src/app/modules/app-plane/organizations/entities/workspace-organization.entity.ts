import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('workspace_organizations') 
export class WorkspaceOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 👇 1. EL PUENTE AL MUNDO GLOBAL
  // Aquí guardaremos el ID de la GlobalOrganization (ej: el ID de la ONU real)
  @Index()
  @Column({ name: 'global_reference_id', nullable: true })
  globalReferenceId: string;

  // 👇 2. IDENTIFICADOR DE PROPIEDAD
  // Para saber si esta org es el propio Tenant (Biofincas) o un socio (ONU)
  @Column({ default: false })
  is_tenant_owner: boolean;

  @Column()
  name: string; 

  @Column({ unique: true }) // Es bueno tener el tax_id también aquí para validaciones locales
  tax_id: string;

  @Column({ nullable: true })
  type: string; 

  @Column({ nullable: true })
  contact_email: string;

  /**
   * Código ISO 3166-1 alpha-2 del país de origen de la organización.
   * Se copia desde global_organizations → global_countries.code al vincular.
   * Concepto: "de dónde es la organización" (≠ "dónde opera el proyecto").
   */
  @Column({ name: 'country_id', type: 'varchar', length: 2, nullable: true })
  countryId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}