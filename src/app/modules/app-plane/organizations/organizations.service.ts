import { Injectable, BadRequestException, Scope, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
// Entidades
import { GlobalOrganization } from '../../control-plane/organizations/entities/global-organization.entity';
import { WorkspaceOrganization } from './entities/workspace-organization.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
// DTOs
import { CreateWorkspaceOrganizationDto } from './dto/create-workspace-organization.dto';
import { UpdateWorkspaceOrganizationDto } from './dto/update-workspace-organization.dto';

@Injectable({ scope: Scope.REQUEST })
export class OrganizationsService {
  constructor(
    private readonly tenantConnection: TenantConnectionService,
    @InjectDataSource('default') private readonly globalDS: DataSource
  ) {}

  // 🔎 NUEVO: BUSCAR EN GLOBAL (Para el Autocomplete del Frontend)
  async searchGlobal(query: string) {
    // Buscamos solo organizaciones verificadas o activas
    return this.globalDS.getRepository(GlobalOrganization).find({
      where: [
        { name: ILike(`%${query}%`) },
        { tax_id: ILike(`%${query}%`) }
      ],
      relations: ['country'], // Útil para mostrar "Cruz Roja (México)"
      select: ['id', 'name', 'tax_id'], // Solo devolvemos lo necesario
      take: 10
    });
  }

  // 🔗 VINCULAR DESDE GLOBAL
  async linkFromGlobal(globalId: string) {
    // A. Buscar en la BD Global (con el país relacionado para obtener el ISO code)
    const globalOrg = await this.globalDS.getRepository(GlobalOrganization).findOne({
      where: { id: globalId },
      relations: ['country'],
    });

    if (!globalOrg) throw new NotFoundException('La organización global no existe.');

    // B. Conexión Tenant
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    // C. Validar duplicados (por referencia global)
    const existingLink = await repo.findOne({ where: { globalReferenceId: globalId } });
    if (existingLink) throw new BadRequestException('Esta organización ya está vinculada en tu espacio.');

    // D. Validar duplicados (por Tax ID - para evitar conflictos de datos maestros)
    const existingTax = await repo.findOne({ where: { tax_id: globalOrg.tax_id } });
    if (existingTax) throw new BadRequestException(`Ya existe una organización local con el Tax ID ${globalOrg.tax_id}.`);

    // E. Crear Copia Local (Mapping Estricto a tu Entidad WorkspaceOrganization)
    const newLocalOrg = repo.create({
      name: globalOrg.name,
      tax_id: globalOrg.tax_id,
      globalReferenceId: globalOrg.id,
      is_tenant_owner: false,
      type: 'PARTNER', // Valor por defecto al importar
      countryId: globalOrg.country?.code ?? null, // ISO 2-char del país de origen
      // contact_email: no lo tenemos en global, se deja null para que lo llenen localmente
    });

    return repo.save(newLocalOrg);
  }

  // 📝 CREAR MANUALMENTE
  async createManual(dto: CreateWorkspaceOrganizationDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    const existing = await repo.findOne({ where: { tax_id: dto.tax_id } });
    if (existing) throw new BadRequestException('Ya existe una organización con ese Tax ID.');

    const newOrg = repo.create({
      ...dto,
      is_tenant_owner: false,
      globalReferenceId: null // Explícito: No viene de global
    });

    return repo.save(newOrg);
  }

  // ✏️ ACTUALIZAR
  async update(id: string, dto: UpdateWorkspaceOrganizationDto, actorMemberId?: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const repo = dataSource.getRepository(WorkspaceOrganization);

    const org = await repo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organización no encontrada.');

    const oldSnapshot = { name: org.name, type: org.type, contact_email: org.contact_email };

    if (dto.name !== undefined) org.name = dto.name.trim();
    if (dto.type !== undefined) org.type = dto.type.trim() || null;
    if (dto.contact_email !== undefined) org.contact_email = dto.contact_email.trim() || null;

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
        changes: { old: oldSnapshot, new: { name: saved.name, type: saved.type, contact_email: saved.contact_email } },
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

  // 📋 LISTAR LOCALES
  async findAll() {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(WorkspaceOrganization).find({
      order: { name: 'ASC' }
    });
  }
}