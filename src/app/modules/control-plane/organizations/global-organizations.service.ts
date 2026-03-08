import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalOrganization } from './entities/global-organization.entity';
import { GlobalUser } from '../users/entities/user.entity';
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
  ) {}

  // 1. CREAR (Estricto a tu entidad)
  async create(data: CreateGlobalOrganizationDto) {
    // Validar duplicados (Tax ID o Nombre)
    const existing = await this.repo.findOne({ 
        where: [
          { tax_id: data.tax_id }, 
          { name: data.name }
        ] 
    });
    
    if (existing) {
        throw new BadRequestException('Ya existe una organización con ese Nombre o Tax ID.');
    }

    const org = this.repo.create({
      name: data.name,
      tax_id: data.tax_id,
      description: data.description,
      countryId: data.countryId // Si viene null, TypeORM lo maneja porque es nullable
    });

    return this.repo.save(org);
  }

  // 2. LISTAR (Incluyendo la relación Country)
  async findAll(query = '') {
    const q = query ?? '';
    return this.repo.find({
      where: q ? [
        { name: ILike(`%${q}%`) },
        { tax_id: ILike(`%${q}%`) }
      ] : undefined,
      relations: ['country'], // 👈 Trae el objeto GlobalCountry asociado
      take: 20,
      order: { name: 'ASC' }
    });
  }

  // 2b. LISTAR SIMPLE (solo id y name para dropdowns)
  async findAllSimple(query: string = '') {
    const orgs = await this.repo.find({
      where: query ? [
        { name: ILike(`%${query}%`) },
        { tax_id: ILike(`%${query}%`) }
      ] : undefined,
      select: ['id', 'name'],
      take: 100,
      order: { name: 'ASC' }
    });
    return orgs.map(org => ({ id: org.id, name: org.name }));
  }

  // 3. BUSCAR UNO
  async findOne(id: string) {
    const org = await this.repo.findOne({ 
        where: { id },
        relations: ['country'] 
    });
    if (!org) throw new NotFoundException('Organización no encontrada');
    return org;
  }

  // 4. ACTUALIZAR
  /**
   * Actualiza una organización con validación de colisiones en name y tax_id.
   * Si se envía name o tax_id, verifica que no colisionen con otra organización.
   */
  async update(id: string, changes: UpdateGlobalOrganizationDto) {
    const org = await this.findOne(id);

    // ─── VALIDACIÓN DE COLISIONES ───
    // Si se intenta actualizar el nombre, verificar que no colisione
    if (changes.name && changes.name !== org.name) {
      const existingByName = await this.repo.findOne({
        where: { name: changes.name },
      });
      if (existingByName && existingByName.id !== id) {
        throw new BadRequestException(
          'Ya existe otra organización con ese nombre.',
        );
      }
    }

    // Si se intenta actualizar el tax_id, verificar que no colisione
    if (changes.tax_id && changes.tax_id !== org.tax_id) {
      const existingByTaxId = await this.repo.findOne({
        where: { tax_id: changes.tax_id },
      });
      if (existingByTaxId && existingByTaxId.id !== id) {
        throw new BadRequestException(
          'Ya existe otra organización con ese Tax ID.',
        );
      }
    }

    // ─── MERGE Y GUARDAR ───
    // Mapear country_id del DTO → countryId de la entidad si viene
    const mergeData: Partial<GlobalOrganization> = {
      name: changes.name,
      tax_id: changes.tax_id,
      description: changes.description,
      countryId: changes.country_id, // Mapear country_id → countryId
    };

    this.repo.merge(org, mergeData);
    const saved = await this.repo.save(org);

    this.eventEmitter.emit('organization.updated', {
      id: saved.id,
      name: saved.name,
      tax_id: saved.tax_id,
    });
    this.logger.log(`Evento 'organization.updated' emitido para ${saved.id}`);

    return saved;
  }

  // 5. BORRAR
  /**
   * Elimina una organización solo si no tiene usuarios asociados.
   * De lo contrario, lanza ConflictException con el conteo de usuarios.
   */
  async remove(id: string) {
    // Verificar que la organización exista
    const org = await this.findOne(id);

    // ─── CONTEO DE USUARIOS ───
    const userCount = await this.userRepo.count({
      where: { organizationId: id },
    });

    // ─── PREVENCIÓN DE ELIMINACIÓN ───
    if (userCount > 0) {
      throw new ConflictException(
        `No se puede eliminar la organización porque tiene ${userCount} usuarios asociados. Reasigne o elimine los usuarios primero.`,
      );
    }

    // ─── BORRADO SEGURO ───
    await this.repo.delete(id);
    return {
      message: `Organización '${org.name}' eliminada exitosamente.`,
      deletedId: id,
    };
  }
}