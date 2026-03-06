import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, Index, Unique } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { StrategicIndicator } from './strategic-indicator.entity'; // 👈 Import renombrado
import { StrategyValue } from './strategy-value.entity';

@Entity('product_strategies')
@Index(['productId', 'indicatorId'], { unique: true })
export class ProductStrategy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // 👇 Vínculo al INDICADOR Estratégico
  @Index()
  @Column({ name: 'indicator_id' })
  indicatorId: string;

  @ManyToOne(() => StrategicIndicator, (ind) => ind.contributions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'indicator_id' })
  indicator: StrategicIndicator;

  // La Promesa
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  committed_target: number; 

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseline: number;

  @OneToMany(() => StrategyValue, (val) => val.productStrategy)
  values: StrategyValue[];

  @CreateDateColumn()
  assignedAt: Date;
}