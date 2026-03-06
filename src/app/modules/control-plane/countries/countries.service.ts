import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlobalCountry } from './entities/country.entity';
import { CreateGlobalCountryDto } from './dto/create-global-country.dto';
import { UpdateGlobalCountryDto } from './dto/update-global-country.dto';
import { ALL_COUNTRIES_SEED } from './seed/all-countries.seed';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(GlobalCountry, 'default')
    private readonly repo: Repository<GlobalCountry>,
  ) {}

  async findAll(): Promise<GlobalCountry[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findByCode(code: string): Promise<GlobalCountry> {
    const country = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!country) throw new NotFoundException(`País con código '${code}' no encontrado`);
    return country;
  }

  async create(dto: CreateGlobalCountryDto): Promise<GlobalCountry> {
    const existing = await this.repo.findOne({ where: { code: dto.code.toUpperCase() } });
    if (existing) throw new ConflictException(`Ya existe un país con código '${dto.code}'`);
    const country = this.repo.create({ ...dto, code: dto.code.toUpperCase() });
    return this.repo.save(country);
  }

  async update(code: string, dto: UpdateGlobalCountryDto): Promise<GlobalCountry> {
    const country = await this.findByCode(code);
    if (dto.code) dto.code = dto.code.toUpperCase();
    Object.assign(country, dto);
    return this.repo.save(country);
  }

  async remove(code: string): Promise<void> {
    const country = await this.findByCode(code);
    await this.repo.remove(country);
  }

  /**
   * Siembra todos los países del mundo (ISO 3166-1).
   * Usa ON CONFLICT para no duplicar registros existentes.
   * Retorna la cantidad de países insertados/actualizados.
   */
  async seedAll(): Promise<{ total: number; message: string }> {
    let upserted = 0;
    for (const c of ALL_COUNTRIES_SEED) {
      const existing = await this.repo.findOne({ where: { code: c.code } });
      if (existing) {
        // Actualizar campos si cambiaron
        let changed = false;
        if (c.name !== existing.name) { existing.name = c.name; changed = true; }
        if (c.timezone !== existing.timezone) { existing.timezone = c.timezone; changed = true; }
        if (c.phone_code !== existing.phone_code) { existing.phone_code = c.phone_code; changed = true; }
        if (c.region !== existing.region) { existing.region = c.region; changed = true; }
        if (changed) {
          await this.repo.save(existing);
          upserted++;
        }
      } else {
        await this.repo.save(this.repo.create(c));
        upserted++;
      }
    }
    return { total: ALL_COUNTRIES_SEED.length, message: `${upserted} países insertados/actualizados de ${ALL_COUNTRIES_SEED.length} totales` };
  }
}
