import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { StrategicIndicator } from './strategic-indicator.entity'; // 👈 Cambio de nombre

@Entity('strategic_outputs')
export class StrategicOutput {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string; // "Output 1"

  @Column()
  name: string; 

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 0 })
  order: number;

  // 👇 Ahora contiene INDICADORES, no objetivos
  @OneToMany(() => StrategicIndicator, (ind) => ind.output)
  indicators: StrategicIndicator[];

  @CreateDateColumn()
  createdAt: Date;
}