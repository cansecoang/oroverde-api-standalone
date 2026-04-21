import { Injectable, Scope, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Task } from './entities/task.entity';
import { ProductMember } from '../products/entities/product-member.entity';
import { Product } from '../products/entities/product.entity';
import { WorkspaceOrganization } from '../organizations/entities/workspace-organization.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TenantRole } from '../../../common/enums/business-roles.enum';
import { NotificationsService } from '../notifications/notifications.service';

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

type TaskActorContext = {
  workspaceMemberId?: string;
  tenantRole?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable({ scope: Scope.REQUEST })
export class TasksService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateTaskDto, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();

    await this.normalizeTaskAssignment(ds, dto.productId, dto, {});

    this.validateDateCoherence(dto.startDate, dto.endDate);

    const task = ds.getRepository(Task).create(dto);

    const saved = await this.withAuditLog<Task>(
      ds,
      (manager) => manager.save(Task, task) as Promise<Task>,
      (result) => ({
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: result.id,
        action: 'CREATE',
        changes: {
          title: result.title,
          productId: result.productId,
          assigneeMemberId: result.assigneeMemberId ?? null,
          phaseId: result.phaseId ?? null,
          statusId: result.statusId ?? null,
          startDate: result.startDate ?? null,
          endDate: result.endDate ?? null,
        },
        ip_address: actor?.ipAddress ?? null,
        user_agent: actor?.userAgent ?? null,
      }),
    );

    const result = await this.findOneWithRelations(ds, saved.id).catch(() => saved);

    if (saved.assigneeMemberId) {
      void this.notifyTaskAssignee(ds, saved);
    }

    return result;
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();

    const task = await ds.getRepository(Task).findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    // IDOR: verify caller has membership in the task's product (except coordinator/superadmin)
    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, task.productId, actor.workspaceMemberId);
    }

    const previousStatusId = task.statusId;

    await this.withAuditLog<Task>(
      ds,
      (manager) => {
        task.statusId = dto.statusId;
        return manager.save(Task, task) as Promise<Task>;
      },
      () => ({
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: id,
        action: 'UPDATE',
        changes: {
          old: { statusId: previousStatusId },
          new: { statusId: dto.statusId },
        },
        ip_address: actor?.ipAddress ?? null,
        user_agent: actor?.userAgent ?? null,
      }),
    );

    return this.findOneWithRelations(ds, id);
  }

  async update(id: string, updateData: Record<string, any>, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    const task = await repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    // IDOR: verify caller has membership in the task's product (except coordinator/superadmin)
    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, task.productId, actor.workspaceMemberId);
    }

    // Prevent moving task to another product
    delete updateData['productId'];

    await this.normalizeTaskAssignment(ds, task.productId, updateData, {
      currentAssigneeMemberId: task.assigneeMemberId ?? null,
      currentAssignedOrganizationId: task.assignedOrganizationId ?? null,
    });

    const effectiveStartDate = 'startDate' in updateData ? updateData.startDate : task.startDate;
    const effectiveEndDate = 'endDate' in updateData ? updateData.endDate : task.endDate;
    const effectiveActualStart = 'actualStartDate' in updateData ? updateData.actualStartDate : task.actualStartDate;
    const effectiveActualEnd = 'actualEndDate' in updateData ? updateData.actualEndDate : task.actualEndDate;
    this.validateDateCoherence(effectiveStartDate, effectiveEndDate, effectiveActualStart, effectiveActualEnd);

    const oldSnapshot = {
      title: task.title,
      statusId: task.statusId,
      assigneeMemberId: task.assigneeMemberId,
    };

    const saved = await this.withAuditLog<Task>(
      ds,
      (manager) => {
        repo.merge(task, updateData);
        return manager.save(Task, task) as Promise<Task>;
      },
      () => ({
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: id,
        action: 'UPDATE',
        changes: { old: oldSnapshot, new: updateData },
        ip_address: actor?.ipAddress ?? null,
        user_agent: actor?.userAgent ?? null,
      }),
    );

    return this.findOneWithRelations(ds, saved.id);
  }

  async remove(id: string, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    const task = await repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, task.productId, actor.workspaceMemberId);
    }

    const snapshot = { title: task.title, productId: task.productId };

    await this.withAuditLog<Task>(
      ds,
      (manager) => manager.remove(Task, task) as Promise<Task>,
      () => ({
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: id,
        action: 'DELETE',
        changes: snapshot,
        ip_address: actor?.ipAddress ?? null,
        user_agent: actor?.userAgent ?? null,
      }),
    );

    return { deleted: true, id };
  }

  async findByProject(productId: string, page = 1, limit = 50) {
    const ds = await this.tenantConnection.getTenantConnection();

    // Use limit/offset (direct SQL) instead of take/skip to avoid TypeORM's DISTINCT
    // subquery optimization, which generates "distinctAlias.Product_id" — a capitalized
    // alias that PostgreSQL rejects because the real column is "product_id".
    const total = await ds.getRepository(Task)
      .createQueryBuilder('task')
      .where('task.productId = :productId', { productId })
      .getCount();

    const data = await ds.getRepository(Task)
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.phase', 'phase')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('assignee.member', 'assigneeMember')
      .leftJoinAndSelect('task.assignedOrganization', 'assignedOrganization')
      .where('task.productId = :productId', { productId })
      .orderBy('task.createdAt', 'DESC')
      .limit(limit)
      .offset((page - 1) * limit)
      .getMany();

    return { data, total, page, limit };
  }

  private async findOneWithRelations(ds: any, id: string) {
    // Use getMany() (no take/skip) to avoid TypeORM's DISTINCT subquery optimization.
    // getOne() internally sets take=1 which triggers executeEntitiesAndRawResults to wrap
    // the query in a "SELECT DISTINCT ... distinctAlias" subquery. TypeORM then generates
    // the alias "Product_id" (entity class name + "_id") for ProductMember's product FK,
    // but PostgreSQL expects "product_id" → error 42703.
    const results = await ds.getRepository(Task)
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.status', 'status')
      .leftJoinAndSelect('task.phase', 'phase')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('assignee.member', 'assigneeMember')
      .leftJoinAndSelect('task.assignedOrganization', 'assignedOrganization')
      .where('task.id = :id', { id })
      .getMany();

    const task = results[0];
    if (!task) {
      throw new NotFoundException('Tarea no encontrada');
    }
    return task;
  }

  private async normalizeTaskAssignment(
    ds: any,
    productId: string,
    payload: Record<string, any>,
    options: {
      currentAssigneeMemberId?: string | null;
      currentAssignedOrganizationId?: string | null;
    },
  ) {
    const hasAssigneeField = Object.prototype.hasOwnProperty.call(payload, 'assigneeMemberId');
    const hasAssignedOrgField = Object.prototype.hasOwnProperty.call(payload, 'assignedOrganizationId');

    if (!hasAssigneeField && !hasAssignedOrgField) {
      return;
    }

    const incomingAssignee = hasAssigneeField
      ? payload.assigneeMemberId
      : options.currentAssigneeMemberId;

    const resolvedAssignee = await this.resolveAssigneeProductMember(ds, productId, incomingAssignee);
    const resolvedAssigneeMemberId = resolvedAssignee?.id ?? null;
    const resolvedAssigneeOrgId = resolvedAssignee?.member?.organizationId ?? null;

    if (hasAssigneeField) {
      payload.assigneeMemberId = resolvedAssigneeMemberId;
    }

    const incomingAssignedOrg = hasAssignedOrgField
      ? payload.assignedOrganizationId
      : options.currentAssignedOrganizationId;

    let normalizedAssignedOrgId: string | null;
    if (incomingAssignedOrg === '' || incomingAssignedOrg === undefined) {
      normalizedAssignedOrgId = null;
    } else {
      normalizedAssignedOrgId = incomingAssignedOrg ?? null;
    }

    // If assignee is provided but organization is omitted, infer it from assignee's workspace organization.
    if (resolvedAssigneeMemberId && !hasAssignedOrgField) {
      normalizedAssignedOrgId = resolvedAssigneeOrgId;
      payload.assignedOrganizationId = normalizedAssignedOrgId;
    }

    // If assignee is explicitly cleared and organization is omitted, clear organization too.
    if (hasAssigneeField && !resolvedAssigneeMemberId && !hasAssignedOrgField) {
      normalizedAssignedOrgId = null;
      payload.assignedOrganizationId = null;
    }

    if (hasAssignedOrgField) {
      payload.assignedOrganizationId = normalizedAssignedOrgId;
    }

    if (normalizedAssignedOrgId) {
      await this.ensureOrganizationExists(ds, normalizedAssignedOrgId);
    }

    if (resolvedAssigneeMemberId && normalizedAssignedOrgId && resolvedAssigneeOrgId && normalizedAssignedOrgId !== resolvedAssigneeOrgId) {
      throw new BadRequestException(
        'La organización asignada no coincide con la organización del responsable seleccionado.',
      );
    }
  }

  private async resolveAssigneeProductMember(
    ds: any,
    productId: string,
    assigneeInput: unknown,
  ): Promise<ProductMember | null> {
    if (assigneeInput === null || assigneeInput === undefined || assigneeInput === '') {
      return null;
    }

    const assigneeId = String(assigneeInput).trim();
    if (!assigneeId) {
      return null;
    }

    const repo = ds.getRepository(ProductMember);

    // Accept either ProductMember.id or WorkspaceMember.id for compatibility with existing clients.
    const byProductMemberId = await repo.findOne({
      where: { id: assigneeId, productId },
      relations: ['member'],
    });
    if (byProductMemberId) {
      return byProductMemberId;
    }

    const byWorkspaceMemberId = await repo.findOne({
      where: { memberId: assigneeId, productId },
      relations: ['member'],
    });
    if (byWorkspaceMemberId) {
      return byWorkspaceMemberId;
    }

    throw new BadRequestException('El responsable no pertenece a este proyecto.');
  }

  private async ensureOrganizationExists(ds: any, organizationId: string) {
    const org = await ds.getRepository(WorkspaceOrganization).findOne({
      where: { id: organizationId },
    });
    if (!org) {
      throw new BadRequestException('La organización asignada no existe en este workspace.');
    }
  }

  private async verifyProductAccess(ds: any, productId: string, workspaceMemberId: string) {
    const membership = await ds.getRepository(ProductMember).findOne({
      where: { productId, memberId: workspaceMemberId },
    });
    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este proyecto.');
    }
  }

  private shouldValidateProductAccess(actor?: TaskActorContext): actor is { workspaceMemberId: string; tenantRole?: string } {
    if (!actor?.workspaceMemberId) return false;
    if (actor.workspaceMemberId === SUPER_ADMIN_SENTINEL_ID) return false;
    if (actor.tenantRole === TenantRole.GENERAL_COORDINATOR) return false;
    return true;
  }

  private async notifyTaskAssignee(ds: any, task: Task): Promise<void> {
    try {
      const pm = await ds.getRepository(ProductMember).findOne({
        where: { id: task.assigneeMemberId },
        select: ['memberId'],
      });

      if (!pm?.memberId) {
        return;
      }

      const productName = await this.resolveProductName(ds, task.productId);

      await this.notifications.createNotification(
        ds,
        pm.memberId,
        'TASK_ASSIGNED',
        'Se te asignó una tarea',
        `Se te asignó la tarea "${task.title}" en el producto "${productName}".`,
        {
          entityType: 'TASK',
          entityId: task.id,
          metadata: { taskTitle: task.title, productName, productId: task.productId },
        },
      );
    } catch {
      // Best-effort notification: ignore failures to preserve primary mutation flow.
    }
  }

  private async resolveProductName(ds: any, productId: string): Promise<string> {
    try {
      const row = await ds.getRepository(Product)
        .createQueryBuilder('product')
        .select('product.name', 'name')
        .where('product.id = :productId', { productId })
        .limit(1)
        .getRawOne() as { name?: string } | undefined;

      return row?.name ?? productId;
    } catch {
      return productId;
    }
  }

  private async withAuditLog<T>(
    ds: any,
    operation: (manager: EntityManager) => Promise<T>,
    buildAudit: (result: T) => {
      actorMemberId: string | null;
      entity: string;
      entityId: string;
      action: string;
      changes: Record<string, any>;
      ip_address?: string | null;
      user_agent?: string | null;
    },
  ): Promise<T> {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await operation(qr.manager);
      await qr.manager.save(AuditLog, qr.manager.create(AuditLog, buildAudit(result)));
      await qr.commitTransaction();
      return result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private validateDateCoherence(
    startDate?: Date | string | null,
    endDate?: Date | string | null,
    actualStartDate?: Date | string | null,
    actualEndDate?: Date | string | null,
  ): void {
    const toMs = (v: Date | string | null | undefined): number | null =>
      v ? new Date(v).getTime() : null;

    const sd = toMs(startDate);
    const ed = toMs(endDate);
    const asd = toMs(actualStartDate);
    const aed = toMs(actualEndDate);

    if (sd !== null && ed !== null && sd > ed) {
      throw new BadRequestException(
        'La fecha de fin planificada no puede ser anterior a la fecha de inicio planificada.',
      );
    }

    if (asd !== null && aed !== null && asd > aed) {
      throw new BadRequestException(
        'La fecha de fin real no puede ser anterior a la fecha de inicio real.',
      );
    }
  }
}