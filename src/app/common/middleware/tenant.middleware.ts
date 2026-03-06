import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface RequestWithTenant extends Request {
  tenantId?: string;
}

// Regex para slugs válidos: letras minúsculas, números y guiones
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: RequestWithTenant, res: Response, next: NextFunction) {
    // Usamos la URL normalizada por Express para evitar bypasses con path traversal
    const url = req.baseUrl + req.path;

    // Rutas públicas: verificamos con boundary de segmento (/ o fin de string)
    const publicPrefixes = [
      '/api/auth',
      '/api/admin',
      '/health',
      '/docs',
    ];

    const isPublic = publicPrefixes.some(
      prefix => url === prefix || url.startsWith(prefix + '/'),
    );

    if (url === '/' || isPublic) {
      return next();
    }

    // ─── TERRITORIO TENANT ───
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId) {
      throw new BadRequestException('Falta el header X-Tenant-ID.');
    }

    if (Array.isArray(tenantId)) {
      throw new BadRequestException('Formato de header inválido.');
    }

    const slug = tenantId.toString().trim().toLowerCase();

    // Validación estricta del formato del slug
    if (!SLUG_REGEX.test(slug) || slug.length > 50) {
      throw new BadRequestException('El header X-Tenant-ID tiene un formato inválido.');
    }

    req.tenantId = slug;
    next();
  }
}