import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, ILike, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalOrganization } from './entities/global-organization.entity';
import { GlobalUser } from '../users/entities/user.entity';
import { GlobalAuditLog } from '../audit/entities/global-audit-log.entity';
import { CreateGlobalOrganizationDto } from './dto/create-global-organization.dto';
import { UpdateGlobalOrganizationDto } from './dto/update-global-organization.dto';

@Injectable()
export class GlobalOrganizationsService {
  private readonly logger = new Logger(GlobalOrganizationsService.name);

  constructor(
    @InjectRepository(GlobalOrganization)
    private readonly repo: Repository<GlobalOrganization>,
    @InjectRepository(GlobalUser)
    private readonly userRepo: Repository<GlobalUser>,
    private readonly eventEmitter: EventEmitter2,
    @InjectDataSource('default') private readonly ds: DataSource,
  ) {}

  // ─── AUDIT HELPER ─────────────────────────────────────────
  private async writeGlobalAudit(
    actorUserId: string | null,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entityId: string,
    changes: Record<string, any> | null,
  ): Promise<void> {
    try {
      const log = this.ds.getRepository(GlobalAuditLog).create({
        actorUserId: actorUserId ?? null,
        action,
        entity: 'ORGANIZATION',
        entityId,
        changes,
      });
      await this.ds.getRepository(GlobalAuditLog).save(log);
    } catch (err) {
      this.logger.warn(`writeGlobalAudit failed (non-fatal): ${err?.message}`);
    }
  }

  // 1. CREAR
  // G-05 (organization_audit.md): La creación de una organización global NO se propaga
  // automáticamente a los silos de tenants. Cada tenant gestiona su propio subconjunto
  // de organizaciones disponibles mediante un link manual (workspace_organizations).
  // NO emitir evento organization.created aquí — es diseño intencional, no un gap.
  async create(data: CreateGlobalOrganizationDto, actorUserId?: string) {
    const existing = await this.repo.findOne({
      where: { name: data.name },
    });

    if (existing) {
      throw new BadRequestException('Ya existe una organización con ese nombre.');
    }

    const org = this.repo.create({
      name: data.name,
      countryId: data.countryId,
    });

    const saved = await this.repo.save(org);

    await this.writeGlobalAudit(actorUserId ?? null, 'CREATE', saved.id, {
      new: { name: saved.name, countryId: saved.countryId },
    });

    return saved;
  }

  // 2. LISTAR
  async findAll(query = '') {
    const q = query ?? '';
    return this.repo.find({
      where: q ? { name: ILike(`%${q}%`) } : undefined,
      relations: ['country'],
      take: 20,
      order: { name: 'ASC' },
    });
  }

  // 2b. LISTAR SIMPLE
  async findAllSimple(query: string = '') {
    const orgs = await this.repo.find({
      where: query ? { name: ILike(`%${query}%`) } : undefined,
      select: ['id', 'name'],
      take: 100,
      order: { name: 'ASC' },
    });
    return orgs.map((org) => ({ id: org.id, name: org.name }));
  }

  // 3. BUSCAR UNO
  async findOne(id: string) {
    const org = await this.repo.findOne({
      where: { id },
      relations: ['country'],
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  // 4. ACTUALIZAR
  async update(id: string, changes: UpdateGlobalOrganizationDto, actorUserId?: string) {
    const org = await this.findOne(id);

    if (changes.name && changes.name !== org.name) {
      const existingByName = await this.repo.findOne({
        where: { name: changes.name },
      });
      if (existingByName && existingByName.id !== id) {
        throw new BadRequestException('Ya existe otra organización con ese nombre.');
      }
    }

    const oldSnapshot = { name: org.name, countryId: org.countryId };

    const mergeData: Partial<GlobalOrganization> = {
      name: changes.name,
      countryId: changes.countryId,
    };

    this.repo.merge(org, mergeData);
    const saved = await this.repo.save(org);

    this.eventEmitter.emit('organization.updated', {
      id: saved.id,
      name: saved.name,
      countryId: saved.countryId ?? null,
    });
    this.logger.log(`Evento 'organization.updated' emitido para ${saved.id}`);

    await this.writeGlobalAudit(actorUserId ?? null, 'UPDATE', saved.id, {
      old: oldSnapshot,
      new: { name: saved.name, countryId: saved.countryId },
    });

    return saved;
  }

  // 5. BORRAR
  async remove(id: string, actorUserId?: string) {
    const org = await this.findOne(id);

    const userCount = await this.userRepo.count({
      where: { organizationId: id },
    });

    if (userCount > 0) {
      throw new ConflictException(
        `No se puede eliminar la organización porque tiene ${userCount} usuarios asociados. Reasigne o elimine los usuarios primero.`,
      );
    }

    await this.repo.delete(id);

    this.eventEmitter.emit('organization.deleted', { id, name: org.name });
    this.logger.log(`Evento 'organization.deleted' emitido para ${id}`);

    await this.writeGlobalAudit(actorUserId ?? null, 'DELETE', id, {
      old: { name: org.name, countryId: org.countryId },
    });

    return {
      message: `Organización '${org.name}' eliminada exitosamente.`,
      deletedId: id,
    };
  }
}
