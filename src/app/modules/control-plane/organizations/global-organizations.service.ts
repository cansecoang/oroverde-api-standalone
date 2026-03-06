import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { GlobalOrganization } from './entities/global-organization.entity';
import { CreateGlobalOrganizationDto } from './dto/create-global-organization.dto';

@Injectable()
export class GlobalOrganizationsService {
  constructor(
    @InjectRepository(GlobalOrganization)
    private readonly repo: Repository<GlobalOrganization>,
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
  async update(id: string, changes: Partial<CreateGlobalOrganizationDto>) {
    const org = await this.findOne(id);
    this.repo.merge(org, changes);
    return this.repo.save(org);
  }

  // 5. BORRAR
  async remove(id: string) {
    return this.repo.delete(id);
  }
}