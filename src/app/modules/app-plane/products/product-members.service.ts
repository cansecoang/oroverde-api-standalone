import { Injectable, BadRequestException, NotFoundException, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../../tenancy/tenant-connection.service';
import { AddProductMemberDto } from './dto/add-product-member.dto';
import { ProductMember } from './entities/product-member.entity';
import { WorkspaceMember } from '../members/entities/workspace-member.entity';
import { Product } from './entities/product.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProductMembersService {
  constructor(private readonly tenantConnection: TenantConnectionService) {}

  async addMember(productId: string, dto: AddProductMemberDto) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    const pmRepo = dataSource.getRepository(ProductMember);
    const wmRepo = dataSource.getRepository(WorkspaceMember);

    // 1. Validar que el miembro exista en el Tenant y esté activo
    // (Opcional: podrías verificar si member.isActive es true si tuvieras ese flag)
    const workspaceMember = await wmRepo.findOne({ 
        where: { id: dto.memberId },
        relations: ['organization'] // Útil si quieres validar reglas de negocio (ej: Solo gente de la propia empresa)
    });
    
    if (!workspaceMember) throw new NotFoundException('El miembro seleccionado no existe en este espacio de trabajo.');

    // 2. Validar que no esté ya en el proyecto
    const existing = await pmRepo.findOne({ 
        where: { productId, memberId: dto.memberId } 
    });
    
    if (existing) throw new BadRequestException('Este usuario ya es parte del proyecto.');

    // 3. Crear la asignación
    const newProductMember = pmRepo.create({
      productId,
      memberId: dto.memberId,
      productRole: dto.role,
      allocation_percentage: dto.allocation || 0,
      isResponsible: dto.isResponsible ?? false,
    });

    return pmRepo.save(newProductMember);
  }

  // Listar miembros con sus datos enriquecidos
  async getProjectTeam(productId: string) {
    const dataSource = await this.tenantConnection.getTenantConnection();
    return dataSource.getRepository(ProductMember).find({
      where: { productId },
      relations: ['member', 'member.organization'], // 👈 ¡MAGIA!
      // Esto te devuelve: { productRole: 'LEADER', member: { full_name: 'Juan', organization: { name: 'USAID' } } }
    });
  }
}