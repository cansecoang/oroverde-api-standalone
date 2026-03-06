import { Injectable, Scope, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Task } from './entities/task.entity';
import { ProductMember } from '../products/entities/product-member.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

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

  async updateStatus(id: string, dto: UpdateTaskStatusDto, workspaceMemberId?: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    const task = await repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    // IDOR: verify caller has membership in the task's product
    if (workspaceMemberId) {
      await this.verifyProductAccess(ds, task.productId, workspaceMemberId);
    }

    task.statusId = dto.statusId;
    return repo.save(task);
  }

  async update(id: string, updateData: Record<string, any>, workspaceMemberId?: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Task);

    const task = await repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('Tarea no encontrada');

    // IDOR: verify caller has membership in the task's product
    if (workspaceMemberId) {
      await this.verifyProductAccess(ds, task.productId, workspaceMemberId);
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
}