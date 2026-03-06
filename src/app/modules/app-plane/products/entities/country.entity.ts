import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Country — Diccionario de países habilitados para este tenant.
 *
 * Tabla local por tenant. Se configura por el administrador del tenant
 * seleccionando países de la lista global (control_plane.global_countries).
 * La PK es el código ISO de 2 letras (ej. 'MX', 'CO'), NO un UUID.
 *
 * Uso principal: product.country_id → countries.id
 */
@Entity('countries')
export class Country {
  @PrimaryColumn({ type: 'varchar', length: 2 })
  id: string; // ISO 3166-1 alpha-2: 'MX', 'CO', 'HN', etc.

  @Column()
  name: string; // 'México', 'Colombia', 'Honduras', etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string; // IANA timezone: 'America/Mexico_City', 'America/Tegucigalpa'
}
