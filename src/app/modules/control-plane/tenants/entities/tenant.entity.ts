import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantStatus } from '../../../../common/enums/tenant-status.enum';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Ej: "Biofincas Corp"

  @Column({ unique: true })
  slug: string; // Ej: "biofincas" (Identificador único para la API)

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE })
  status: TenantStatus;

  // 🔌 LA LLAVE DEL SILO
  // Aquí guardamos el nombre real de la base de datos de este cliente
  @Column({ name: 'db_name', nullable: false })
  dbName: string;

  // ── Metadatos del workspace (opcionales, para Hub de proyectos) ──────────
  @Column({ name: 'logo_url', nullable: true, type: 'text' })
  logoUrl: string | null;

  @Column({ nullable: true, type: 'text' })
  location: string | null;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}