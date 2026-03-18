import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { GlobalAuditLog } from './entities/global-audit-log.entity';
import { AuditLog } from '../../app-plane/audit/entities/audit-log.entity';
import { GlobalUser } from '../users/entities/user.entity';
import { WorkspaceMember } from '../../app-plane/members/entities/workspace-member.entity';
import { getAppPlaneDataSourceBySlug } from '../../tenancy/tenant-connection.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class AuditAdminService {
  constructor(
    @InjectRepository(GlobalAuditLog, 'default')
    private readonly globalRepo: Repository<GlobalAuditLog>,
    @InjectDataSource('default')
    private readonly controlPlaneDs: DataSource,
  ) {}

  async getControlPlaneLogs(filters: AuditQueryDto) {
    const { entity, action, actorUserId, dateFrom, dateTo, page = 1, limit = 50 } = filters;

    const where: FindOptionsWhere<GlobalAuditLog> = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (actorUserId) where.actorUserId = actorUserId;

    if (dateFrom && dateTo) {
      where.performedAt = Between(new Date(dateFrom), new Date(dateTo));
    } else if (dateFrom) {
      where.performedAt = MoreThanOrEqual(new Date(dateFrom));
    } else if (dateTo) {
      where.performedAt = LessThanOrEqual(new Date(dateTo));
    }

    const [items, total] = await this.globalRepo.findAndCount({
      where,
      order: { performedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enrich with actor email from users table
    const actorIds = [...new Set(items.map(i => i.actorUserId).filter((id): id is string => !!id))];
    const emailMap = new Map<string, string>();
    if (actorIds.length) {
      const users = await this.controlPlaneDs
        .getRepository(GlobalUser)
        .find({ where: { id: In(actorIds) }, select: ['id', 'email'] });
      users.forEach(u => emailMap.set(u.id, u.email));
    }

    const enriched = items.map(item => ({
      ...item,
      actorEmail: item.actorUserId ? (emailMap.get(item.actorUserId) ?? null) : null,
    }));

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAppPlaneLogs(tenantSlug: string, filters: AuditQueryDto) {
    if (!tenantSlug) {
      throw new BadRequestException('tenantSlug is required for app-plane audit logs');
    }

    const { entity, action, dateFrom, dateTo, page = 1, limit = 50 } = filters;

    const ds = await getAppPlaneDataSourceBySlug(tenantSlug, this.controlPlaneDs);
    const repo = ds.getRepository(AuditLog);

    const where: FindOptionsWhere<AuditLog> = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;

    if (dateFrom && dateTo) {
      where.performed_at = Between(new Date(dateFrom), new Date(dateTo));
    } else if (dateFrom) {
      where.performed_at = MoreThanOrEqual(new Date(dateFrom));
    } else if (dateTo) {
      where.performed_at = LessThanOrEqual(new Date(dateTo));
    }

    const [items, total] = await repo.findAndCount({
      where,
      order: { performed_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enrich with actor email from workspace_members (cached email field)
    const memberIds = [...new Set(items.map(i => i.actorMemberId).filter((id): id is string => !!id))];
    const emailMap = new Map<string, string>();
    if (memberIds.length) {
      const members = await ds
        .getRepository(WorkspaceMember)
        .find({ where: { id: In(memberIds) }, select: ['id', 'email'] });
      members.forEach(m => emailMap.set(m.id, m.email));
    }

    const enriched = items.map(item => ({
      ...item,
      actorEmail: item.actorMemberId ? (emailMap.get(item.actorMemberId) ?? null) : null,
    }));

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
