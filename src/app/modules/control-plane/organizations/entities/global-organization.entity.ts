import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { GlobalCountry } from '../../countries/entities/country.entity'; // 👈 Importar

@Entity('organizations')
export class GlobalOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  // --- 🌍 RELACIÓN CON PAÍS ---
  // Stores the ISO 3166-1 alpha-2 code (e.g. 'MX', 'US') — FK to global_countries.code
  @Column({ name: 'country_id', type: 'varchar', length: 2, nullable: true })
  countryId: string;

  @ManyToOne(() => GlobalCountry)
  @JoinColumn({ name: 'country_id', referencedColumnName: 'code' })
  country: GlobalCountry;
  // -----------------------------

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}