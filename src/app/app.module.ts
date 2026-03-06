import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerModule } from '@nestjs-modules/mailer';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';


// Entidades
import { Tenant } from './modules/control-plane/tenants/entities/tenant.entity';
import { TenantMember } from './modules/control-plane/tenants/entities/tenant-member.entity';
import { GlobalUser } from './modules/control-plane/users/entities/user.entity';
import { GlobalOrganization } from './modules/control-plane/organizations/entities/global-organization.entity';
import { GlobalCountry } from './modules/control-plane/countries/entities/country.entity';

// Módulos
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AppPlaneModule } from './modules/app-plane/app-plane.module';
import { ControlPlaneModule } from './modules/control-plane/control-plane.module';
import { AuthModule } from './modules/auth/auth.module';

import { TenantMiddleware } from './common/middleware/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate Limiting global: 60 requests por minuto por IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbHost = config.get<string>('DB_HOST', 'localhost');
        const dbSslEnabled = config.get<string>('DB_SSL', 'false') === 'true';

        return {
          name: 'default',
          type: 'postgres',
          host: dbHost,
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASS'),
          database: config.get<string>('DB_NAME', 'control_plane'),
          entities: [Tenant, GlobalUser, TenantMember, GlobalOrganization, GlobalCountry],
          autoLoadEntities: false,
          synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
          logging: config.get<string>('DB_LOGGING', 'false') === 'true',
          // SSL para Azure o cuando se habilita explícitamente por variable de entorno.
          ssl: dbSslEnabled || dbHost.includes('azure')
            ? { rejectUnauthorized: false }
            : false,
        };
      },
    }),

    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'), 
          port: config.get<number>('MAIL_PORT', 587),
          secure: false, 
          auth: {
            user: config.get<string>('MAIL_USER'),
            pass: config.get<string>('MAIL_PASS'),
          },
        },
        defaults: {
          from: config.get<string>('MAIL_FROM'),
        },
      }),
    }),

    ControlPlaneModule,
    TenancyModule,
    AppPlaneModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // M-5: Activar rate limiting globalmente (60 req/min por IP)
    { provide: APP_GUARD, useClass: ThrottlerGuard },

  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}