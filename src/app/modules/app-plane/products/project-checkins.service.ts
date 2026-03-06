import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { ProjectCheckIn } from './entities/project-checkin.entity';
import { CreateCheckInDto } from './dto/create-checkin.dto';
import { ProductMember } from '../products/entities/product-member.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProjectCheckInsService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  // 1. AGENDAR REUNIÓN
  async schedule(dto: CreateCheckInDto) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);
    const memberRepo = ds.getRepository(ProductMember);

    // dto.organizerId llega como WorkspaceMember.id → resolver a ProductMember.id
    const organizer = await memberRepo.findOne({ where: { memberId: dto.organizerId } });
    if (!organizer) throw new NotFoundException('El organizador no es miembro de este producto.');

    // Resolver attendeeIds (WorkspaceMember IDs → ProductMember IDs)
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
      organizerId: organizer.id, // ProductMember.id real
      attendees: resolvedAttendees, // entidades ProductMember reales
      linkedTasks: dto.linkedTaskIds?.map((id) => ({ id } as any)) || [],
    });

    return repo.save(newCheckIn);
  }

  // 2. OBTENER DETALLE (CON RELACIONES)
  async findOne(id: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    return ds.getRepository(ProjectCheckIn).findOne({
      where: { id },
      relations: [
        'organizer',           // Quién convocó
        'organizer.member',    // Datos del usuario (nombre, email)
        'attendees',           // Lista de invitados
        'attendees.member',    // Nombres de los invitados
        'linkedTasks',         // Tareas ligadas
        'linkedTasks.status'   // Para ver en qué estado están esas tareas
      ]
    });
  }

  // 3. COMPLETAR / MINUTA
  async complete(id: string, notes: string) {
    const ds = await this.tenantConnection.getTenantConnection();
    const repo = ds.getRepository(ProjectCheckIn);
    
    const checkIn = await repo.findOne({ where: { id } });
    if (!checkIn) throw new NotFoundException('Check-in no encontrado');

    checkIn.notes = notes;
    checkIn.is_completed = true;

    return repo.save(checkIn);
  }
}