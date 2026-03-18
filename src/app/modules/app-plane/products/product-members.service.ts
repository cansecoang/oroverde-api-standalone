import { Injectable, BadRequestException, NotFoundException, Scope } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { AddProductMemberDto } from './dto/add-product-member.dto';
import { UpdateProductMemberDto } from './dto/update-product-member.dto';
import { ProductMember } from './entities/product-member.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Product } from './entities/product.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable({ scope: Scope.REQUEST })
export class ProductMembersService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    private readonly notifications: NotificationsService,
  ) {}

  async addMember(productId: string, dto: AddProductMemberDto, actorMemberId?: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const pmRepo = dataSource.getRepository(ProductMember);
    const wmRepo = dataSource.getRepository(WorkspaceMember);

    const workspaceMember = await wmRepo.findOne({
      where: { id: dto.memberId },
      relations: ['organization'],
    });
    if (!workspaceMember) {
      throw new NotFoundException('El miembro seleccionado no existe en este espacio de trabajo.');
    }

    const existing = await pmRepo.findOne({ where: { productId, memberId: dto.memberId } });
    if (existing) {
      throw new BadRequestException('Este usuario ya es parte del proyecto.');
    }

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let saved: ProductMember;
    try {
      const newProductMember = queryRunner.manager.create(ProductMember, {
        productId,
        memberId: dto.memberId,
        productRole: dto.role,
        allocation_percentage: dto.allocation ?? 0,
        isResponsible: dto.isResponsible ?? false,
      });
      saved = await queryRunner.manager.save(ProductMember, newProductMember);

      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: actorMemberId ?? null,
        entity: 'product_member',
        entityId: saved.id,
        action: 'CREATE',
        changes: {
          new: {
            productId,
            memberId: dto.memberId,
            productRole: dto.role,
            allocation_percentage: dto.allocation ?? 0,
            isResponsible: dto.isResponsible ?? false,
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

    // Best-effort notification — outside transaction to avoid rollback on committed tx
    const product = await dataSource.getRepository(Product).findOne({ where: { id: productId }, select: ['name'] }).catch(() => null);
    const productName = product?.name ?? productId;
    void this.notifications.createNotification(
      dataSource,
      dto.memberId,
      'PRODUCT_MEMBER_ADDED',
      'Fuiste añadido a un producto',
      `Fuiste añadido al producto "${productName}" como ${dto.role}.`,
      { entityType: 'PRODUCT', entityId: productId, metadata: { productName, role: dto.role } },
    );

    return saved!;
  }

  async updateMember(
    productId: string,
    memberId: string,
    dto: UpdateProductMemberDto,
    actorMemberId?: string,
  ) {
    const dataSource = await this.tenantConnection.getTenantConnection();

    const productMember = await dataSource.getRepository(ProductMember).findOne({
      where: { id: memberId, productId },
    });
    if (!productMember) {
      throw new NotFoundException('Membresía no encontrada en este producto.');
    }

    const oldSnapshot = {
      productRole: productMember.productRole,
      allocation_percentage: productMember.allocation_percentage,
      isResponsible: productMember.isResponsible,
    };

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (dto.role !== undefined) productMember.productRole = dto.role;
      if (dto.allocation !== undefined) productMember.allocation_percentage = dto.allocation;
      if (dto.isResponsible !== undefined) productMember.isResponsible = dto.isResponsible;

      await queryRunner.manager.save(ProductMember, productMember);

      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: actorMemberId ?? null,
        entity: 'product_member',
        entityId: memberId,
        action: 'UPDATE',
        changes: {
          old: oldSnapshot,
          new: {
            productRole: productMember.productRole,
            allocation_percentage: productMember.allocation_percentage,
            isResponsible: productMember.isResponsible,
          },
        },
      });
      await queryRunner.manager.save(AuditLog, auditLog);

      await queryRunner.commitTransaction();
      return productMember;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async removeMember(productId: string, memberId: string, actorMemberId?: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();

    const productMember = await dataSource.getRepository(ProductMember).findOne({
      where: { id: memberId, productId },
    });
    if (!productMember) {
      throw new NotFoundException('Membresía no encontrada en este producto.');
    }

    const recipientMemberId = productMember.memberId;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const oldSnapshot = {
        memberId: productMember.memberId,
        productRole: productMember.productRole,
        allocation_percentage: productMember.allocation_percentage,
        isResponsible: productMember.isResponsible,
      };

      await queryRunner.manager.remove(ProductMember, productMember);

      const auditLog = queryRunner.manager.create(AuditLog, {
        actorMemberId: actorMemberId ?? null,
        entity: 'product_member',
        entityId: memberId,
        action: 'DELETE',
        changes: { old: oldSnapshot },
      });
      await queryRunner.manager.save(AuditLog, auditLog);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();

      const dbMessage = err instanceof QueryFailedError
        ? String((err as any).driverError?.message ?? err.message ?? '')
        : String((err as any)?.message ?? '');

      const organizerConstraintHit =
        dbMessage.includes('organizer_id') ||
        dbMessage.includes('FK_912c220391f771bc2987328c93b') ||
        (dbMessage.includes('project_checkins') && dbMessage.includes('null value'));

      if (organizerConstraintHit) {
        throw new BadRequestException(
          'No se puede remover este miembro porque figura como organizador en uno o mas check-ins del producto. Reasigna o depura esos check-ins antes de eliminar la membresia.',
        );
      }

      throw err;
    } finally {
      await queryRunner.release();
    }

    // Best-effort notification — outside transaction to avoid rollback on committed tx
    const product = await dataSource.getRepository(Product).findOne({ where: { id: productId }, select: ['name'] }).catch(() => null);
    const productName = product?.name ?? productId;
    void this.notifications.createNotification(
      dataSource,
      recipientMemberId,
      'PRODUCT_MEMBER_REMOVED',
      'Fuiste removido de un producto',
      `Fuiste removido del producto "${productName}".`,
      { entityType: 'PRODUCT', entityId: productId, metadata: { productName } },
    );
  }

  async getProjectTeam(productId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(ProductMember).find({
      where: { productId },
      relations: ['member', 'member.organization'],
    });
  }
}
