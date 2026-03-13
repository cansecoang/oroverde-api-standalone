import { Injectable, Scope, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Task } from './entities/task.entity';
import { ProductMember } from '../products/entities/product-member.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TenantRole } from '../../../common/enums/business-roles.enum';

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

type TaskActorContext = {
  workspaceMemberId?: string;
  tenantRole?: string;
};

@Injectable({ scope: Scope.REQUEST })
export class TasksService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  async create(dto: CreateTaskDto) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    if (dto.assigneeMemberId) {
        const productMember = await ds.getRepository(ProductMember).findOne({
            where: { memberId: dto.assigneeMemberId, productId: dto.productId }
        });
        if (!productMember) throw new BadRequestException('El responsable no pertenece a este proyecto.');
        dto.assigneeMemberId = productMember.id;
    }

    const task = repo.create(dto);
    return repo.save(task);
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, actor?: TaskActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    const task = await repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    // IDOR: verify caller has membership in the task's product (except coordinator/superadmin)
    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, task.productId, actor.workspaceMemberId);
    }

    task.statusId = dto.statusId;
    return repo.save(task);
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

    repo.merge(task, updateData);
    return repo.save(task);
  }

  async findByProject(productId: string, page = 1, limit = 50) {
    const ds = await this.tenantConnection.getTenantConnection();
    const [data, total] = await ds.getRepository(Task).findAndCount({
      where: { productId },
      relations: ['status', 'phase', 'assignee', 'assignee.member'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
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