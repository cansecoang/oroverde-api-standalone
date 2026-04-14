import { Injectable, BadRequestException, ConflictException, Scope, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
// Entidades
import { GlobalOrganization } from '../../control-plane/organizations/entities/global-organization.entity';
import { WorkspaceOrganization, WorkspaceOrgType } from './entities/workspace-organization.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
// DTOs
import { UpdateWorkspaceOrganizationDto } from './dto/update-workspace-organization.dto';

@Injectable({ scope: Scope.REQUEST })
export class OrganizationsService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    @InjectDataSource('default') private readonly globalDS: DataSource,
  ) {}

  // 🔎 BUSCAR EN GLOBAL (Para el Autocomplete del Frontend)
  async searchGlobal(query: string) {
    return this.globalDS.getRepository(GlobalOrganization).find({
      where: { name: ILike(`%${query}%`) },
      select: ['id', 'name'],
      take: 10,
    });
  }

  // 🔗 VINCULAR DESDE GLOBAL
  async linkFromGlobal(globalId: string) {
    const globalOrg = await this.globalDS.getRepository(GlobalOrganization).findOne({
      where: { id: globalId },
      relations: ['country'],
    });

    if (!globalOrg) throw new NotFoundException('La organización global no existe.');

    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    const existingLink = await repo.findOne({ where: { globalReferenceId: globalId } });
    if (existingLink) throw new BadRequestException('Esta organización ya está vinculada en tu espacio.');

    const newLocalOrg = repo.create({
      name: globalOrg.name,
      globalReferenceId: globalOrg.id,
      is_tenant_owner: false,
      type: WorkspaceOrgType.PARTNER,
      countryId: globalOrg.country?.code ?? null,
    });

    return repo.save(newLocalOrg);
  }

  // ✏️ ACTUALIZAR (solo type — el nombre lo gestiona el control plane vía sync)
  async update(id: string, dto: UpdateWorkspaceOrganizationDto, actorMemberId?: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    const org = await repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada.');

    const oldSnapshot = { type: org.type };

    if (dto.type !== undefined) org.type = (dto.type as WorkspaceOrgType) ?? null;

    const saved = await repo.save(org);

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const auditLog = qr.manager.create(AuditLog, {
        actorMemberId: actorMemberId ?? null,
        entity: 'workspace_organization',
        entityId: saved.id,
        action: 'UPDATE',
        changes: { old: oldSnapshot, new: { type: saved.type } },
      });
      await qr.manager.save(AuditLog, auditLog);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return saved;
  }

  // 🗑 DESVINCULAR (elimina la copia local del workspace)
  async unlink(id: string, actorMemberId?: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    const org = await repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada.');

    if (org.is_tenant_owner) {
      throw new BadRequestException('No se puede desvincular la organización propietaria del workspace.');
    }

    const productCount = await dataSource.query(
      `SELECT COUNT(*)::int AS cnt FROM products WHERE owner_organization_id = $1`,
      [id],
    );
    if (parseInt(productCount[0]?.cnt ?? '0', 10) > 0) {
      throw new ConflictException(
        `No se puede desvincular: la organización es propietaria de ${productCount[0].cnt} producto(s). Reasigne los productos primero.`,
      );
    }

    const memberCount = await dataSource.query(
      `SELECT COUNT(*)::int AS cnt FROM workspace_members WHERE organization_id = $1`,
      [id],
    );
    if (parseInt(memberCount[0]?.cnt ?? '0', 10) > 0) {
      throw new ConflictException(
        `No se puede desvincular: ${memberCount[0].cnt} miembro(s) del workspace pertenecen a esta organización. Reasigne los miembros primero.`,
      );
    }

    await repo.delete(id);

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const auditLog = qr.manager.create(AuditLog, {
        actorMemberId: actorMemberId ?? null,
        entity: 'workspace_organization',
        entityId: id,
        action: 'DELETE',
        changes: { old: { name: org.name, type: org.type } },
      });
      await qr.manager.save(AuditLog, auditLog);
      await qr.commitTransaction();
    } catch {
      await qr.rollbackTransaction();
    } finally {
      await qr.release();
    }

    return { message: `Organización '${org.name}' desvinculada exitosamente.`, unlinkedId: id };
  }

  // 📋 LISTAR LOCALES
  async findAll() {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(WorkspaceOrganization).find({
      order: { name: 'ASC' },
    });
  }
}
