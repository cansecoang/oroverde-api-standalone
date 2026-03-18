import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('product_creation_requests')
export class ProductCreationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['PENDING', 'APPROVED', 'DECLINED'],
    default: 'PENDING',
  })
  status: 'PENDING' | 'APPROVED' | 'DECLINED';

  @Index()
  @Column({ name: 'requester_member_id', type: 'uuid', nullable: true })
  requesterMemberId: string | null;

  @Column({ name: 'reviewer_member_id', type: 'uuid', nullable: true })
  reviewerMemberId: string | null;

  @Column({ name: 'reviewer_note', type: 'text', nullable: true })
  reviewerNote: string | null;

  @Column({ name: 'request_payload', type: 'jsonb' })
  requestPayload: Record<string, unknown>;

  @Column({ name: 'resulting_product_id', type: 'uuid', nullable: true })
  resultingProductId: string | null;

  @Index()
  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
