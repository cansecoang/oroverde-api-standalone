import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { Notification } from './entities/notification.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { ProductMember } from '../products/entities/product-member.entity';
import { TenantRole } from '../../../common/enums/business-roles.enum';

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

export interface CreateNotificationOpts {
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

@Injectable({ scope: Scope.REQUEST })
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly tenantConnection: TenantConnectionService) {}

  // ── Core: create a single notification (best-effort, never throws) ──────────
  async createNotification(
    ds: DataSource,
    recipientMemberId: string,
    type: string,
    title: string,
    message: string,
    opts?: CreateNotificationOpts,
  ): Promise<void> {
    if (!recipientMemberId || recipientMemberId === SUPER_ADMIN_SENTINEL_ID) {
      return;
    }
    try {
      const repo = ds.getRepository(Notification);
      const notif = repo.create({
        recipientMemberId,
        type,
        title,
        message,
        entityType: opts?.entityType ?? null,
        entityId: opts?.entityId ?? null,
        metadata: opts?.metadata ?? null,
      });
      await repo.save(notif);
    } catch (err: any) {
      this.logger.error(`Failed to create notification [${type}] for ${recipientMemberId}: ${err?.message}`);
    }
  }

  // ── Broadcast: notify all GENERAL_COORDINATORs in the tenant ────────────────
  async notifyAllCoordinators(
    ds: DataSource,
    type: string,
    title: string,
    message: string,
    opts?: CreateNotificationOpts,
  ): Promise<void> {
    try {
      const coordinators = await ds.getRepository(WorkspaceMember).find({
        where: { tenantRole: TenantRole.GENERAL_COORDINATOR },
        select: ['id'],
      });
      await Promise.all(
        coordinators.map(c =>
          this.createNotification(ds, c.id, type, title, message, opts),
        ),
      );
    } catch (err: any) {
      this.logger.error(`notifyAllCoordinators [${type}] failed: ${err?.message}`);
    }
  }

  // ── Broadcast: notify all members of a product ──────────────────────────────
  async notifyProductMembers(
    ds: DataSource,
    productId: string,
    type: string,
    title: string,
    message: string,
    opts?: CreateNotificationOpts,
  ): Promise<void> {
    try {
      const productMembers = await ds.getRepository(ProductMember).find({
        where: { productId },
        select: ['memberId'],
      });
      await Promise.all(
        productMembers.map(pm =>
          this.createNotification(ds, pm.memberId, type, title, message, opts),
        ),
      );
    } catch (err: any) {
      this.logger.error(`notifyProductMembers [${type}] for ${productId} failed: ${err?.message}`);
    }
  }

  // ── Query: get paginated notifications for the calling member ───────────────
  async getMyNotifications(
    recipientMemberId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(Notification);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);

    const [items, total] = await repo.findAndCount({
      where: { recipientMemberId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    const unreadCount = await repo.count({
      where: { recipientMemberId, isRead: false },
    });

    return { items, total, unreadCount };
  }

  // ── Query: fast unread count ─────────────────────────────────────────────────
  async getUnreadCount(recipientMemberId: string): Promise<number> {
    const ds = await this.tenantConnection.getTenantConnection();
    return ds.getRepository(Notification).count({
      where: { recipientMemberId, isRead: false },
    });
  }

  // ── Mutation: mark one as read (with ownership check) ───────────────────────
  async markAsRead(notifId: string, recipientMemberId: string): Promise<void> {
    const ds = await this.tenantConnection.getTenantConnection();
    await ds.getRepository(Notification).update(
      { id: notifId, recipientMemberId },
      { isRead: true },
    );
  }

  // ── Mutation: mark all as read ───────────────────────────────────────────────
  async markAllAsRead(recipientMemberId: string): Promise<void> {
    const ds = await this.tenantConnection.getTenantConnection();
    await ds.getRepository(Notification).update(
      { recipientMemberId, isRead: false },
      { isRead: true },
    );
  }
}
