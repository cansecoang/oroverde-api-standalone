import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { ProductStrategy } from './product-strategy.entity';
import { StrategicOutput } from './strategic-output.entity';

@Entity('strategic_indicators') // 👈 Tabla renombrada
export class StrategicIndicator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // "3.7"

  @Column("text")
  description: string; // "Un mínimo de 6 soluciones..."

  @Column()
  unit: string; // "Soluciones"

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_target: number; 

  // 👇 NUEVO: Fecha Límite / Planeada
  // Es opcional (nullable: true) para que puedan registrarla después
  @Column({ type: 'date', nullable: true, name: 'planned_completion_date' })
  plannedCompletionDate: Date;

  // 👇 NUEVO: Fecha Real de Cierre
  // Se llena solo cuando se cumple la meta
  @Column({ type: 'date', nullable: true, name: 'actual_completion_date' })
  actualCompletionDate: Date;

  // Pertenece a un Output
  @Index()
  @Column({ name: 'output_id', nullable: true })
  outputId: string;

  @ManyToOne(() => StrategicOutput, (out) => out.indicators, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'output_id' })
  output: StrategicOutput;

  // Sus contribuciones (Proyectos)
  @OneToMany(() => ProductStrategy, (ps) => ps.indicator)
  contributions: ProductStrategy[];

  @CreateDateColumn()
  createdAt: Date;
}