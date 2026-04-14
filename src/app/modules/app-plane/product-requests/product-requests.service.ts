import {
  Injectable,
  BadRequestException,
  ForbiddenException,
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
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';
import { Country } from '../products/entities/country.entity';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { plainToInstance } from 'class-transformer';
import { NotificationsService } from '../notifications/notifications.service';
import { StrategicIndicator } from '../strategy/entities/strategic-indicator.entity';
import { ProductFieldDefinition } from '../field-definitions/entities/product-field-definition.entity';
import { CatalogItem } from '../catalogs/entities/catalog-item.entity';
import { TenantRole } from '../../../common/enums/business-roles.enum';

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
    data: (ProductCreationRequest & {
      requesterName: string | null;
      ownerOrganizationName: string | null;
      countryName: string | null;
    })[];
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
        memberMap.set(m.id, [m.first_name, m.last_name].filter(Boolean).join(' '));
      }
    }

    // Batch-resolve org and country names — no N+1
    const orgIds = [
      ...new Set(
        requests.map(r => (r.requestPayload as any)?.ownerOrganizationId).filter(Boolean),
      ),
    ] as string[];
    const countryIds = [
      ...new Set(
        requests.map(r => (r.requestPayload as any)?.countryId).filter(Boolean),
      ),
    ] as string[];

    const orgMap = new Map<string, string>();
    const countryMap = new Map<string, string>();

    if (orgIds.length > 0) {
      const orgs = await dataSource.getRepository(WorkspaceOrganization).findBy({ id: In(orgIds) });
      for (const o of orgs) orgMap.set(o.id, o.name);
    }
    if (countryIds.length > 0) {
      const countries = await dataSource.getRepository(Country).findBy({ id: In(countryIds) });
      for (const c of countries) countryMap.set(c.id, c.name);
    }

    const data = requests.map(r => ({
      ...r,
      requesterName: r.requesterMemberId ? (memberMap.get(r.requesterMemberId) ?? null) : null,
      ownerOrganizationName: orgMap.get((r.requestPayload as any)?.ownerOrganizationId) ?? null,
      countryName: countryMap.get((r.requestPayload as any)?.countryId) ?? null,
    }));

    return { data, total, page, limit };
  }

  async getMyRequests(requesterMemberId: string): Promise<{
    data: (ProductCreationRequest & {
      ownerOrganizationName: string | null;
      countryName: string | null;
      strategicIndicatorDetails: { indicatorId: string; target: number; description: string; unit: string }[];
      responsibleMemberDetails: { memberId: string; name: string }[];
    })[];
    total: number;
  }> {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const [requests, total] = await dataSource
      .getRepository(ProductCreationRequest)
      .findAndCount({ where: { requesterMemberId }, order: { submittedAt: 'DESC' } });

    if (requests.length === 0) return { data: [], total };

    // ── Batch: org names ─────────────────────────────────────────────────────
    const orgIds = [...new Set(
      requests.map(r => (r.requestPayload as any)?.ownerOrganizationId).filter(Boolean) as string[],
    )];
    const orgMap = new Map<string, string>();
    if (orgIds.length > 0) {
      const orgs = await dataSource.getRepository(WorkspaceOrganization).findBy({ id: In(orgIds) });
      for (const o of orgs) orgMap.set(o.id, o.name);
    }

    // ── Batch: country names ─────────────────────────────────────────────────
    const countryIds = [...new Set(
      requests.map(r => (r.requestPayload as any)?.countryId).filter(Boolean) as string[],
    )];
    const countryMap = new Map<string, string>();
    if (countryIds.length > 0) {
      const countries = await dataSource.getRepository(Country).findBy({ id: In(countryIds) });
      for (const c of countries) countryMap.set(c.id, c.name);
    }

    // ── Batch: strategic indicator details ───────────────────────────────────
    const allIndicatorIds = [...new Set(
      requests.flatMap(r => {
        const inds = (r.requestPayload as any)?.strategicIndicators ?? [];
        return (inds as { indicatorId: string }[]).map(i => i.indicatorId);
      }).filter(Boolean) as string[],
    )];
    const indicatorMap = new Map<string, { description: string; unit: string }>();
    if (allIndicatorIds.length > 0) {
      const indicators = await dataSource.getRepository(StrategicIndicator).findBy({ id: In(allIndicatorIds) });
      for (const ind of indicators) indicatorMap.set(ind.id, { description: ind.description, unit: ind.unit });
    }

    // ── Batch: responsible member names ─────────────────────────────────────
    const allMemberIds = [...new Set(
      requests.flatMap(r => {
        const ids = (r.requestPayload as any)?.memberIds ?? [];
        return ids as string[];
      }).filter(Boolean) as string[],
    )];
    const memberNameMap = new Map<string, string>();
    if (allMemberIds.length > 0) {
      const members = await dataSource.getRepository(WorkspaceMember).findBy({ id: In(allMemberIds) });
      for (const m of members) {
        memberNameMap.set(m.id, [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email);
      }
    }

    const data = requests.map(r => {
      const payload = r.requestPayload as any;
      const rawInds: { indicatorId: string; target: number }[] = payload?.strategicIndicators ?? [];
      const rawMemberIds: string[] = payload?.memberIds ?? [];

      return {
        ...r,
        ownerOrganizationName: payload?.ownerOrganizationId ? (orgMap.get(payload.ownerOrganizationId) ?? null) : null,
        countryName: payload?.countryId ? (countryMap.get(payload.countryId) ?? null) : null,
        strategicIndicatorDetails: rawInds.map(s => ({
          indicatorId: s.indicatorId,
          target: s.target,
          description: indicatorMap.get(s.indicatorId)?.description ?? '',
          unit: indicatorMap.get(s.indicatorId)?.unit ?? '',
        })),
        responsibleMemberDetails: rawMemberIds.map(id => ({
          memberId: id,
          name: memberNameMap.get(id) ?? id,
        })),
      };
    });

    return { data, total };
  }

  async getRequestById(
    requestId: string,
    callerMemberId: string,
    callerTenantRole: string,
  ): Promise<{
    request: ProductCreationRequest;
    requesterName: string | null;
    requesterEmail: string | null;
    reviewerName: string | null;
    ownerOrganizationName: string | null;
    countryName: string | null;
    participatingOrganizations: { id: string; name: string }[];
    strategicIndicatorDetails: {
      indicatorId: string;
      target: number;
      indicator: { code: string; description: string; unit: string } | null;
      output: { code: string; name: string } | null;
    }[];
    responsibleMembers: {
      memberId: string;
      name: string;
      email: string;
      organizationName: string | null;
    }[];
    customFieldDetails: {
      fieldId: string;
      label: string;
      type: string;
      valueText: string | null;
      valueCatalogId: string | null;
      catalogItemName: string | null;
      orgIds: string[];
      orgNames: string[];
      catalogItemIds: string[];
      catalogItemNames: string[];
    }[];
  }> {
    const dataSource = await this.tenantConnection.getTenantConnection();

    const request = await dataSource.getRepository(ProductCreationRequest).findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(`Solicitud con id "${requestId}" no encontrada`);
    }

    // C-1: IDOR guard — only GC or the original requester may read this record
    const isGC = callerTenantRole === TenantRole.GENERAL_COORDINATOR;
    const isOwner = request.requesterMemberId === callerMemberId;
    if (!isGC && !isOwner) {
      throw new ForbiddenException('No tienes acceso a esta solicitud');
    }

    const payload = request.requestPayload as Record<string, any>;

    // ── Extract IDs for batch queries ─────────────────────────────────────────
    const partOrgIds: string[] = Array.isArray(payload?.participatingOrganizationIds)
      ? (payload.participatingOrganizationIds as string[])
      : [];
    const rawIndicators: { indicatorId: string; target: number }[] = Array.isArray(payload?.strategicIndicators)
      ? (payload.strategicIndicators as { indicatorId: string; target: number }[])
      : [];
    const rawMemberIds: string[] = Array.isArray(payload?.memberIds)
      ? (payload.memberIds as string[])
      : [];
    const customValues: { fieldId: string; valueText?: string; valueCatalogId?: string }[] =
      Array.isArray(payload?.customValues) ? payload.customValues : [];
    const customOrgFields: { fieldId: string; orgIds: string[] }[] =
      Array.isArray(payload?.customOrgFields) ? payload.customOrgFields : [];
    const customCatalogFields: { fieldId: string; catalogItemIds: string[] }[] =
      Array.isArray(payload?.customCatalogFields) ? payload.customCatalogFields : [];

    const indicatorIds = rawIndicators.map(s => s.indicatorId);
    const allFieldIds = [
      ...customValues.map(v => v.fieldId),
      ...customOrgFields.map(f => f.fieldId),
      ...customCatalogFields.map(f => f.fieldId),
    ];
    const allCatalogItemIds = [
      ...customValues.map(v => v.valueCatalogId).filter(Boolean) as string[],
      ...customCatalogFields.flatMap(f => f.catalogItemIds),
    ];
    const allOrgMultiIds = customOrgFields.flatMap(f => f.orgIds);

    // C-2: All independent lookups run in parallel ─────────────────────────────
    const [
      requesterMember,
      reviewerMember,
      ownerOrg,
      country,
      partOrgs,
      indicators,
      responsibleMemberRows,
      fieldDefs,
      catalogItems,
      orgMultiRows,
    ] = await Promise.all([
      request.requesterMemberId
        ? dataSource.getRepository(WorkspaceMember).findOne({ where: { id: request.requesterMemberId } })
        : Promise.resolve(null),
      request.reviewerMemberId
        ? dataSource.getRepository(WorkspaceMember).findOne({ where: { id: request.reviewerMemberId } })
        : Promise.resolve(null),
      payload?.ownerOrganizationId
        ? dataSource.getRepository(WorkspaceOrganization).findOne({ where: { id: payload.ownerOrganizationId as string } })
        : Promise.resolve(null),
      payload?.countryId
        ? dataSource.getRepository(Country).findOne({ where: { id: payload.countryId as string } })
        : Promise.resolve(null),
      partOrgIds.length > 0
        ? dataSource.getRepository(WorkspaceOrganization).findBy({ id: In(partOrgIds) })
        : Promise.resolve([]),
      indicatorIds.length > 0
        ? dataSource.getRepository(StrategicIndicator).find({ where: { id: In(indicatorIds) }, relations: ['output'] })
        : Promise.resolve([]),
      rawMemberIds.length > 0
        ? dataSource.getRepository(WorkspaceMember).find({ where: { id: In(rawMemberIds) }, relations: ['organization'] })
        : Promise.resolve([]),
      allFieldIds.length > 0
        ? dataSource.getRepository(ProductFieldDefinition).findBy({ id: In([...new Set(allFieldIds)]) })
        : Promise.resolve([]),
      allCatalogItemIds.length > 0
        ? dataSource.getRepository(CatalogItem).findBy({ id: In([...new Set(allCatalogItemIds)]) })
        : Promise.resolve([]),
      allOrgMultiIds.length > 0
        ? dataSource.getRepository(WorkspaceOrganization).findBy({ id: In([...new Set(allOrgMultiIds)]) })
        : Promise.resolve([]),
    ]);

    // ── Map results ───────────────────────────────────────────────────────────
    const requesterName = requesterMember
      ? ([requesterMember.first_name, requesterMember.last_name].filter(Boolean).join(' ') || null)
      : null;
    const requesterEmail = requesterMember?.email ?? null;
    const reviewerName = reviewerMember
      ? ([reviewerMember.first_name, reviewerMember.last_name].filter(Boolean).join(' ') || null)
      : null;

    const ownerOrganizationName = ownerOrg?.name ?? null;
    const countryName = country?.name ?? null;

    const participatingOrganizations = (partOrgs as WorkspaceOrganization[]).map(o => ({ id: o.id, name: o.name }));

    const indicatorMap = new Map((indicators as StrategicIndicator[]).map(i => [i.id, i]));
    const strategicIndicatorDetails = rawIndicators.map(s => {
      const ind = indicatorMap.get(s.indicatorId);
      return {
        indicatorId: s.indicatorId,
        target: s.target,
        indicator: ind ? { code: ind.code, description: ind.description, unit: ind.unit } : null,
        output: ind?.output ? { code: ind.output.code, name: ind.output.name } : null,
      };
    });

    const responsibleMembers = (responsibleMemberRows as WorkspaceMember[]).map(m => ({
      memberId: m.id,
      name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email,
      email: m.email,
      organizationName: (m.organization as WorkspaceOrganization | null)?.name ?? null,
    }));

    const fieldDefMap = new Map((fieldDefs as ProductFieldDefinition[]).map(f => [f.id, f]));
    const catalogItemMap = new Map((catalogItems as CatalogItem[]).map(item => [item.id, item.name]));
    const orgMultiMap = new Map((orgMultiRows as WorkspaceOrganization[]).map(o => [o.id, o.name]));

    const customFieldDetails = [
      ...customValues.map(v => {
        const fd = fieldDefMap.get(v.fieldId);
        return {
          fieldId: v.fieldId,
          label: fd?.label ?? v.fieldId,
          type: fd?.type ?? 'TEXT',
          valueText: v.valueText ?? null,
          valueCatalogId: v.valueCatalogId ?? null,
          catalogItemName: v.valueCatalogId ? (catalogItemMap.get(v.valueCatalogId) ?? null) : null,
          orgIds: [],
          orgNames: [],
          catalogItemIds: [],
          catalogItemNames: [],
        };
      }),
      ...customOrgFields.map(f => {
        const fd = fieldDefMap.get(f.fieldId);
        return {
          fieldId: f.fieldId,
          label: fd?.label ?? f.fieldId,
          type: fd?.type ?? 'ORG_MULTI',
          valueText: null,
          valueCatalogId: null,
          catalogItemName: null,
          orgIds: f.orgIds,
          orgNames: f.orgIds.map(id => orgMultiMap.get(id) ?? id),
          catalogItemIds: [],
          catalogItemNames: [],
        };
      }),
      ...customCatalogFields.map(f => {
        const fd = fieldDefMap.get(f.fieldId);
        return {
          fieldId: f.fieldId,
          label: fd?.label ?? f.fieldId,
          type: fd?.type ?? 'CATALOG_MULTI',
          valueText: null,
          valueCatalogId: null,
          catalogItemName: null,
          orgIds: [],
          orgNames: [],
          catalogItemIds: f.catalogItemIds,
          catalogItemNames: f.catalogItemIds.map(id => catalogItemMap.get(id) ?? id),
        };
      }),
    ];

    return {
      request,
      requesterName,
      requesterEmail,
      reviewerName,
      ownerOrganizationName,
      countryName,
      participatingOrganizations,
      strategicIndicatorDetails,
      responsibleMembers,
      customFieldDetails,
    };
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
      request.status = dto.action === 'approve' ? 'APPROVED' : dto.action === 'decline' ? 'DECLINED' : 'REJECTED';
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
        : dto.action === 'decline'
          ? 'Solicitud devuelta con observaciones'
          : 'Solicitud de producto rechazada';
      const notifMsg = dto.action === 'approve'
        ? `Tu solicitud de producto "${productName}" fue aprobada.`
        : dto.action === 'decline'
          ? `Tu solicitud de producto "${productName}" fue devuelta.${request.reviewerNote ? ` Nota: ${request.reviewerNote}` : ''}`
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
