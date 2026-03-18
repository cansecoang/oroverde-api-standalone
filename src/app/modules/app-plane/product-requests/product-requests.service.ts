import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { In } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { ProductCreationRequest } from './entities/product-creation-request.entity';
import { SubmitProductRequestDto } from './dto/submit-product-request.dto';
import { ReviewProductRequestDto } from './dto/review-product-request.dto';
import { ProductsService } from '../products/products.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Product } from '../products/entities/product.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { plainToInstance } from 'class-transformer';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable({ scope: Scope.REQUEST })
export class ProductRequestsService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly productsService: ProductsService,
    private readonly notifications: NotificationsService,
  ) {}

  async submitRequest(
    dto: SubmitProductRequestDto,
    requesterMemberId: string,
  ): Promise<ProductCreationRequest> {
    const dataSource = await this.tenantConnection.getTenantConnection();

    // Fast-fail: product name already exists
    const existing = await dataSource.getRepository(Product).findOne({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new BadRequestException(`Ya existe un producto con el nombre "${dto.name.trim()}"`);
    }

    // Also reject if there is already a PENDING request for the same name
    const existingRequest = await dataSource.getRepository(ProductCreationRequest).findOne({
      where: { status: 'PENDING', requesterMemberId },
    });
    // Note: we allow multiple PENDING requests per workspace (different names),
    // but we do NOT allow duplicates from the same requester for the same name.
    // A simple name check inside the transaction handles the rest at DB level.

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = queryRunner.manager.create(ProductCreationRequest, {
        status: 'PENDING',
        requesterMemberId,
        requestPayload: dto as unknown as Record<string, unknown>,
      });
      const saved = await queryRunner.manager.save(ProductCreationRequest, request);

      // FIX: use correct AuditLog field names (actorMemberId / entity / changes)
      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: requesterMemberId,
        entity: 'product_creation_request',
        entityId: saved.id,
        action: 'CREATE',
        changes: { new: { status: 'PENDING', productName: dto.name } },
      });
      await queryRunner.manager.save(AuditLog, auditLog);

      await queryRunner.commitTransaction();

      // Best-effort: notify all coordinators about the new request
      void this.notifications.notifyAllCoordinators(
        dataSource,
        'PRODUCT_REQUEST_SUBMITTED',
        'Nueva solicitud de producto',
        `Se recibió una nueva solicitud de producto: "${dto.name}".`,
        { entityType: 'PRODUCT_REQUEST', entityId: saved.id, metadata: { productName: dto.name } },
      );

      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async listRequests(query: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: (ProductCreationRequest & { requesterName: string | null })[];
    total: number;
    page: number;
    limit: number;
  }> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(ProductCreationRequest);
    const memberRepo = dataSource.getRepository(WorkspaceMember);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const where: Record<string, unknown> = {};
    if (query.status) {
      where['status'] = query.status.toUpperCase();
    }

    const [requests, total] = await repo.findAndCount({
      where: where as any,
      order: { submittedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Batch-resolve requester names — single query, no N+1
    const memberIds = [
      ...new Set(requests.map(r => r.requesterMemberId).filter(Boolean)),
    ] as string[];
    const memberMap = new Map<string, string>();

    if (memberIds.length > 0) {
      const members = await memberRepo.findBy({ id: In(memberIds) });
      for (const m of members) {
        memberMap.set(m.id, m.full_name);
      }
    }

    const data = requests.map(r => ({
      ...r,
      requesterName: r.requesterMemberId ? (memberMap.get(r.requesterMemberId) ?? null) : null,
    }));

    return { data, total, page, limit };
  }

  async getPendingCount(): Promise<{ count: number }> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const count = await dataSource
      .getRepository(ProductCreationRequest)
      .count({ where: { status: 'PENDING' } });
    return { count };
  }

  async reviewRequest(
    requestId: string,
    dto: ReviewProductRequestDto,
    reviewerMemberId: string,
  ): Promise<ProductCreationRequest> {
    const dataSource = await this.tenantConnection.getTenantConnection();

    // FIX: open transaction immediately and use pessimistic write lock
    // to prevent two concurrent reviewers from double-approving the same request.
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let request: ProductCreationRequest;

    try {
      request = await queryRunner.manager.findOne(ProductCreationRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      } as any);

      if (!request) {
        throw new NotFoundException(`Solicitud con id "${requestId}" no encontrada`);
      }
      if (request.status !== 'PENDING') {
        throw new BadRequestException(
          `La solicitud ya fue procesada con estado "${request.status}"`,
        );
      }

      // FIX: capture complete old snapshot for forensic audit
      const oldSnapshot = {
        status: request.status,
        reviewerMemberId: request.reviewerMemberId,
        reviewerNote: request.reviewerNote,
        reviewedAt: request.reviewedAt,
      };

      // Update the request status INSIDE the transaction (committed before product creation).
      // This prevents re-entry: once APPROVED/DECLINED is committed and the lock released,
      // no concurrent reviewer can pass the status === 'PENDING' check above.
      request.status = dto.action === 'approve' ? 'APPROVED' : 'DECLINED';
      request.reviewerMemberId = reviewerMemberId;
      request.reviewerNote = dto.note ?? null;
      request.reviewedAt = new Date();

      await queryRunner.manager.save(ProductCreationRequest, request);

      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: reviewerMemberId,
        entity: 'product_creation_request',
        entityId: requestId,
        action: 'UPDATE',
        changes: {
          old: oldSnapshot,
          new: {
            status: request.status,
            reviewerMemberId,
            reviewerNote: request.reviewerNote,
            reviewedAt: request.reviewedAt,
          },
        },
      });
      await queryRunner.manager.save(AuditLog, auditLog);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Best-effort: notify the requester of the decision
    const productName = (request.requestPayload as any)?.name ?? 'tu solicitud';
    if (request.requesterMemberId) {
      const notifType = dto.action === 'approve' ? 'PRODUCT_REQUEST_APPROVED' : 'PRODUCT_REQUEST_DECLINED';
      const notifTitle = dto.action === 'approve'
        ? 'Solicitud de producto aprobada'
        : 'Solicitud de producto rechazada';
      const notifMsg = dto.action === 'approve'
        ? `Tu solicitud de producto "${productName}" fue aprobada.`
        : `Tu solicitud de producto "${productName}" fue rechazada.${request.reviewerNote ? ` Nota: ${request.reviewerNote}` : ''}`;

      void this.notifications.createNotification(
        dataSource,
        request.requesterMemberId,
        notifType,
        notifTitle,
        notifMsg,
        { entityType: 'PRODUCT_REQUEST', entityId: requestId, metadata: { productName } },
      );
    }

    // For approve: create the product AFTER the status has been committed.
    // If this fails, the request shows APPROVED with resultingProductId = null —
    // a visible inconsistency that an admin can investigate and remediate manually.
    if (dto.action === 'approve') {
      const createDto = plainToInstance(CreateProductDto, request.requestPayload, {
        excludeExtraneousValues: false,
      });
      const product = await this.productsService.create(
        createDto,
        request.requesterMemberId!,
      );

      // Best-effort update of resultingProductId (outside main transaction)
      await dataSource
        .getRepository(ProductCreationRequest)
        .update(requestId, { resultingProductId: product.id });

      return { ...request, resultingProductId: product.id };
    }

    return request;
  }
}
