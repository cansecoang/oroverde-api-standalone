import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('global_countries')
export class GlobalCountry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 2 })
  code: string; // Código ISO 3166-1 alpha-2: MX, CO, US, ES

  @Column()
  name: string; // México, Colombia, United States

  @Column({ length: 50, nullable: true })
  timezone: string; // IANA timezone: America/Mexico_City, Europe/Madrid

  @Column({ length: 10, nullable: true })
  phone_code: string; // +52, +57, +1

  @Column({ length: 50, nullable: true })
  region: string; // Americas, Europe, Asia, Africa, Oceania
}