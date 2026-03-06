import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { GlobalCountry } from '../../countries/entities/country.entity'; // 👈 Importar

@Entity('organizations')
export class GlobalOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string; 

  @Column({ type: 'text', nullable: true })
  description: string; // 👈 Nuevo: Descripción de la ONG

  @Column({ unique: true })
  tax_id: string; // RUC, NIT, RFC (Identificador único)
  
  // --- 🌍 RELACIÓN CON PAÍS ---
  @Column({ name: 'country_id', nullable: true }) // Nullable al inicio por si migras datos viejos
  countryId: string;

  @ManyToOne(() => GlobalCountry)
  @JoinColumn({ name: 'country_id' })
  country: GlobalCountry;
  // -----------------------------

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}