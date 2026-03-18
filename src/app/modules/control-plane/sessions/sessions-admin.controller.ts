import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GlobalRole } from '../../../common/enums/global-roles.enum';
import { SessionsAdminService } from './sessions-admin.service';

@Controller('admin/sessions')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class SessionsAdminController {
  constructor(private readonly sessionsService: SessionsAdminService) {}

  /**
   * GET /api/admin/sessions
   * Retorna todas las sesiones activas en Redis con datos de usuario enriquecidos.
   */
  @Get()
  listSessions(@Req() req: Request) {
    return this.sessionsService.listSessions(req.sessionID);
  }

  /**
   * DELETE /api/admin/sessions/:sessionId
   * Revoca (elimina de Redis) una sesión específica.
   */
  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  revokeSession(@Param('sessionId') sessionId: string) {
    return this.sessionsService.revokeSession(sessionId);
  }

  /**
   * DELETE /api/admin/sessions/user/:userId
   * Revoca todas las sesiones activas de un usuario específico.
   */
  @Delete('user/:userId')
  @HttpCode(HttpStatus.OK)
  revokeUserSessions(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.sessionsService.revokeUserSessions(userId);
  }
}
