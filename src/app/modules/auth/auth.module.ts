import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { SessionSerializer } from './session.serializer';
import { AuthController } from './auth.controller';

// Entidades y Módulos externos
import { GlobalUser } from '../control-plane/users/entities/user.entity';
import { TenantMember } from '../control-plane/tenants/entities/tenant-member.entity';
import { Tenant } from '../control-plane/tenants/entities/tenant.entity';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [
    // Importamos el módulo que contiene a GlobalUsersService
    ControlPlaneModule, 
    
    // Importamos las Entidades para poder inyectar sus repositorios
    TypeOrmModule.forFeature([GlobalUser, TenantMember, Tenant]),
    
    // Configuración de Auth
    PassportModule.register({ session: true }),
    
    // ❌ BORRADO: Repository (No es un módulo)
  ],
  providers: [
    AuthService, 
    LocalStrategy, 
    SessionSerializer
  ],
  controllers: [
    AuthController,
    // ❌ BORRADO: AuthService (Es un provider, no un controller)
  ],
  exports: [AuthService],
})
export class AuthModule {}