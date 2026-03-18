import { Injectable, Scope, NotFoundException, ForbiddenException } from '@nestjs/common';
import { In, LessThan, MoreThanOrEqual, Not } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { ProjectCheckIn } from './entities/project-checkin.entity';
import { ProductMember } from '../products/entities/product-member.entity';
import { Product } from './entities/product.entity';
import { Task } from '../tasks/entities/task.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { UpdateCheckInDto } from './dto/update-checkin.dto';
import { CompleteCheckInDto } from './dto/complete-checkin.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantRole } from '../../../common/enums/business-roles.enum';

const SUPER_ADMIN_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

type CheckInActorContext = {
  workspaceMemberId?: string;
  tenantRole?: string;
};

const CHECKIN_RELATIONS = [
  'organizer',
  'organizer.member',
  'attendees',
  'attendees.member',
  'linkedTasks',
  'linkedTasks.status',
];

@Injectable({ scope: Scope.REQUEST })
export class ProjectCheckInsService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── 1. LIST BY PRODUCT ─────────────────────────────────────────────────────
  async findByProduct(
    productId: string,
    pastPage = 1,
    pastLimit = 10,
  ) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);
    const now = new Date();

    const upcoming = await repo.find({
      where: { productId, is_completed: false, scheduled_at: MoreThanOrEqual(now) },
      relations: CHECKIN_RELATIONS,
      order: { scheduled_at: 'ASC' },
    });

    const [past, pastTotal] = await repo
      .createQueryBuilder('ci')
      .leftJoinAndSelect('ci.organizer', 'organizer')
      .leftJoinAndSelect('organizer.member', 'organizerMember')
      .leftJoinAndSelect('ci.attendees', 'attendees')
      .leftJoinAndSelect('attendees.member', 'attendeeMember')
      .leftJoinAndSelect('ci.linkedTasks', 'linkedTasks')
      .leftJoinAndSelect('linkedTasks.status', 'taskStatus')
      .where('ci.product_id = :productId', { productId })
      .andWhere('(ci.is_completed = true OR ci.scheduled_at < :now)', { now })
      .orderBy('ci.scheduled_at', 'DESC')
      .skip((pastPage - 1) * pastLimit)
      .take(pastLimit)
      .getManyAndCount();

    return {
      nextCheckin: upcoming[0] ?? null,
      upcoming,
      past,
      pastTotal,
      pastPage,
      pastLimit,
    };
  }

  // ── 2. GET DETAIL ──────────────────────────────────────────────────────────
  async findOne(id: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    const checkIn = await ds.getRepository(ProjectCheckIn).findOne({
      where: { id },
      relations: CHECKIN_RELATIONS,
    });
    if (!checkIn) throw new NotFoundException('Check-in no encontrado');
    return checkIn;
  }

  // ── 3. SCHEDULE ────────────────────────────────────────────────────────────
  async schedule(dto: CreateCheckInDto, actor?: CheckInActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);
    const memberRepo = ds.getRepository(ProductMember);

    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, dto.productId, actor.workspaceMemberId!);
    }

    const organizer = await memberRepo.findOne({ where: { memberId: dto.organizerId } });
    if (!organizer) throw new NotFoundException('El organizador no es miembro de este producto.');

    let resolvedAttendees: ProductMember[] = [];
    if (dto.attendeeIds?.length) {
      resolvedAttendees = await memberRepo.find({
        where: { memberId: In(dto.attendeeIds) },
      });
    }

    const newCheckIn = repo.create({
      title: dto.title,
      topic: dto.topic,
      scheduled_at: dto.scheduled_at,
      meeting_link: dto.meeting_link,
      productId: dto.productId,
      organizerId: organizer.id,
      attendees: resolvedAttendees,
      linkedTasks: dto.linkedTaskIds?.map((id) => ({ id } as Task)) ?? [],
    });

    const saved = await repo.save(newCheckIn);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.save(AuditLog, qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'project_checkin',
        entityId: saved.id,
        action: 'CREATE',
        changes: { title: saved.title, scheduled_at: saved.scheduled_at, productId: saved.productId },
      }));
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    // Best-effort: notify all product members about the scheduled check-in
    const product = await ds.getRepository(Product).findOne({ where: { id: dto.productId }, select: ['name'] });
    const productName = product?.name ?? dto.productId;
    void this.notifications.notifyProductMembers(
      ds,
      dto.productId,
      'CHECKIN_SCHEDULED',
      'Check-in programado',
      `Se programó un check-in "${dto.title}" para el producto "${productName}".`,
      { entityType: 'CHECK_IN', entityId: saved.id, metadata: { checkInTitle: dto.title, productName, productId: dto.productId, scheduledAt: dto.scheduled_at } },
    );

    return this.findOne(saved.id);
  }

  // ── 4. UPDATE ──────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateCheckInDto, actor?: CheckInActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);

    const checkIn = await repo.findOne({ where: { id }, relations: ['attendees', 'linkedTasks'] });
    if (!checkIn) throw new NotFoundException('Check-in no encontrado');

    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, checkIn.productId, actor.workspaceMemberId!);
    }

    const oldSnapshot = {
      title: checkIn.title,
      topic: checkIn.topic,
      scheduled_at: checkIn.scheduled_at,
      meeting_link: checkIn.meeting_link,
    };

    if (dto.title !== undefined) checkIn.title = dto.title;
    if (dto.topic !== undefined) checkIn.topic = dto.topic;
    if (dto.scheduled_at !== undefined) checkIn.scheduled_at = dto.scheduled_at as any;
    if (dto.meeting_link !== undefined) checkIn.meeting_link = dto.meeting_link;

    if (dto.attendeeIds !== undefined) {
      checkIn.attendees = dto.attendeeIds.length
        ? await ds.getRepository(ProductMember).find({ where: { memberId: In(dto.attendeeIds) } })
        : [];
    }

    if (dto.linkedTaskIds !== undefined) {
      checkIn.linkedTasks = dto.linkedTaskIds.map((taskId) => ({ id: taskId } as Task));
    }

    const saved = await repo.save(checkIn);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.save(AuditLog, qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'project_checkin',
        entityId: id,
        action: 'UPDATE',
        changes: { old: oldSnapshot, new: dto },
      }));
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return this.findOne(saved.id);
  }

  // ── 5. COMPLETE / MINUTAS ──────────────────────────────────────────────────
  async complete(id: string, dto: CompleteCheckInDto, actor?: CheckInActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);

    const checkIn = await repo.findOne({ where: { id } });
    if (!checkIn) throw new NotFoundException('Check-in no encontrado');

    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, checkIn.productId, actor.workspaceMemberId!);
    }

    const oldSnapshot = { is_completed: checkIn.is_completed, notes: checkIn.notes };

    checkIn.notes = dto.notes ?? checkIn.notes ?? null;
    checkIn.is_completed = true;
    const saved = await repo.save(checkIn);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.save(AuditLog, qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'project_checkin',
        entityId: id,
        action: 'UPDATE',
        changes: { old: oldSnapshot, new: { is_completed: true, notes: saved.notes } },
      }));
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return this.findOne(saved.id);
  }

  // ── 6. MY UPCOMING CHECK-INS (dashboard personal) ──────────────────────────
  /**
   * Devuelve los próximos check-ins (no completados, scheduled_at > now) donde el
   * workspace-member es organizador o asistente, para el dashboard personalizado.
   * Retorna máximo 10, ordenados por fecha ASC.
   */
  async getMyUpcomingCheckins(memberId: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    const now = new Date();

    // 1. Obtener los IDs de ProductMember para este workspace-member
    const pmRecords = await ds.getRepository(ProductMember).find({
      where: { memberId },
      select: ['id'],
    });
    if (!pmRecords.length) return [];
    const pmIds = pmRecords.map((pm) => pm.id);

    // 2. Check-ins donde el usuario es organizador
    const asOrganizer = await ds.getRepository(ProjectCheckIn).find({
      where: { organizerId: In(pmIds), is_completed: false, scheduled_at: MoreThanOrEqual(now) },
      relations: CHECKIN_RELATIONS.concat(['product']),
      order: { scheduled_at: 'ASC' },
    });

    // 3. Check-ins donde el usuario es asistente (pero no organizador) via tabla pivote
    const pivotRows: { checkin_id: string }[] = await ds.query(
      `SELECT DISTINCT cap.checkin_id
       FROM checkin_attendees_pivot cap
       WHERE cap.member_id = ANY($1)`,
      [pmIds],
    );
    const attendeeCheckinIds = pivotRows.map((r) => r.checkin_id);

    let asAttendee: ProjectCheckIn[] = [];
    if (attendeeCheckinIds.length) {
      asAttendee = await ds.getRepository(ProjectCheckIn).find({
        where: {
          id: In(attendeeCheckinIds),
          is_completed: false,
          scheduled_at: MoreThanOrEqual(now),
          organizerId: Not(In(pmIds)), // evitar duplicados con asOrganizer
        },
        relations: CHECKIN_RELATIONS.concat(['product']),
        order: { scheduled_at: 'ASC' },
      });
    }

    // 4. Fusionar, ordenar y limitar a 10
    const combined = [...asOrganizer, ...asAttendee].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

    return combined.slice(0, 10).map((ci) => ({
      ...ci,
      productName: (ci as any).product?.name ?? '',
      myRole: pmIds.includes(ci.organizerId) ? 'organizer' : 'attendee',
    }));
  }

  // ── 7. DELETE ──────────────────────────────────────────────────────────────
  async remove(id: string, actor?: CheckInActorContext) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);

    const checkIn = await repo.findOne({ where: { id } });
    if (!checkIn) throw new NotFoundException('Check-in no encontrado');

    if (this.shouldValidateProductAccess(actor)) {
      await this.verifyProductAccess(ds, checkIn.productId, actor.workspaceMemberId!);
    }

    await repo.remove(checkIn);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.save(AuditLog, qr.manager.create(AuditLog, {
        actorMemberId: actor?.workspaceMemberId ?? null,
        entity: 'project_checkin',
        entityId: id,
        action: 'DELETE',
        changes: { title: checkIn.title, scheduled_at: checkIn.scheduled_at },
      }));
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return { message: 'Check-in eliminado exitosamente', id };
  }

  // ── HELPERS DE ACCESO ──────────────────────────────────────────────────────

  private async verifyProductAccess(ds: any, productId: string, workspaceMemberId: string) {
    const membership = await ds.getRepository(ProductMember).findOne({
      where: { productId, memberId: workspaceMemberId },
    });
    if (!membership) {
      throw new ForbiddenException('No tienes acceso a este producto.');
    }
  }

  private shouldValidateProductAccess(
    actor?: CheckInActorContext,
  ): actor is { workspaceMemberId: string; tenantRole?: string } {
    if (!actor?.workspaceMemberId) return false;
    if (actor.workspaceMemberId === SUPER_ADMIN_SENTINEL_ID) return false;
    if (actor.tenantRole === TenantRole.GENERAL_COORDINATOR) return false;
    return true;
  }
}
