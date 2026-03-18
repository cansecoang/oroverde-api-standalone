import { Injectable, Scope, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
};

@Injectable({ scope: Scope.REQUEST })
export class TasksService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateTaskDto, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    await this.normalizeTaskAssignment(
      ds,
      dto.productId,
      dto,
      {},
    );

    const task = repo.create(dto);
    const saved = await repo.save(task);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const auditLog = qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: saved.id,
        action: 'CREATE',
        changes: { title: saved.title, productId: saved.productId },
      });
      await qr.manager.save(AuditLog, auditLog);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    const result = await this.findOneWithRelations(ds, saved.id);

    // Best-effort: notify the assignee if one was set
    if (saved.assigneeMemberId) {
      const pm = await ds.getRepository(ProductMember).findOne({
        where: { id: saved.assigneeMemberId },
        select: ['memberId'],
      });
      if (pm?.memberId) {
        const product = await ds.getRepository(Product).findOne({ where: { id: saved.productId }, select: ['name'] });
        const productName = product?.name ?? saved.productId;
        void this.notifications.createNotification(
          ds,
          pm.memberId,
          'TASK_ASSIGNED',
          'Se te asignó una tarea',
          `Se te asignó la tarea "${saved.title}" en el producto "${productName}".`,
          { entityType: 'TASK', entityId: saved.id, metadata: { taskTitle: saved.title, productName, productId: saved.productId } },
        );
      }
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

    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      task.statusId = dto.statusId;
      await queryRunner.manager.save(Task, task);

      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: id,
        action: 'UPDATE',
        changes: {
          old: { statusId: previousStatusId },
          new: { statusId: dto.statusId },
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

    await this.normalizeTaskAssignment(
      ds,
      task.productId,
      updateData,
      {
        currentAssigneeMemberId: task.assigneeMemberId ?? null,
        currentAssignedOrganizationId: task.assignedOrganizationId ?? null,
      },
    );

    const oldSnapshot = { title: task.title, statusId: task.statusId, assigneeMemberId: task.assigneeMemberId };
    repo.merge(task, updateData);
    const saved = await repo.save(task);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const auditLog = qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: saved.id,
        action: 'UPDATE',
        changes: { old: oldSnapshot, new: updateData },
      });
      await qr.manager.save(AuditLog, auditLog);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

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
    await repo.remove(task);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const auditLog = qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'task',
        entityId: id,
        action: 'DELETE',
        changes: snapshot,
      });
      await qr.manager.save(AuditLog, auditLog);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return { deleted: true, id };
  }

  async findByProject(productId: string, page = 1, limit = 50) {
    const ds = await this.tenantConnection.getTenantConnection();
    const [data, total] = await ds.getRepository(Task).findAndCount({
      where: { productId },
      relations: ['status', 'phase', 'assignee', 'assignee.member', 'assignedOrganization'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  private async findOneWithRelations(ds: any, id: string) {
    const task = await ds.getRepository(Task).findOne({
      where: { id },
      relations: ['status', 'phase', 'assignee', 'assignee.member', 'assignedOrganization'],
    });
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
}