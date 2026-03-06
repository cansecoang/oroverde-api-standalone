import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ProductStrategy } from './product-strategy.entity';

@Entity('strategy_values')
export class StrategyValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number; // Lo que se logró en este reporte (Ej: 1)

  @Column({ type: 'date' })
  date: Date; // Fecha del logro

  @Column({ type: 'text', nullable: true })
  notes: string; // Comentarios: "Diseño finalizado con Banco X"

  @Column({ type: 'text', nullable: true })
  evidence_url: string; // Link a PDF/Imagen

  // Se vincula a la ASIGNACIÓN del proyecto
  @Index()
  @Column({ name: 'product_strategy_id' })
  productStrategyId: string;

  @ManyToOne(() => ProductStrategy, (ps) => ps.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_strategy_id' })
  productStrategy: ProductStrategy;

  @CreateDateColumn()
  reported_at: Date;
}