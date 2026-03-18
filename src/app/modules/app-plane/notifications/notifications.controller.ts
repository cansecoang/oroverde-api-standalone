import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AuthenticatedGuard } from '../../../common/guards/authenticated.guard';
import { TenantAccessGuard } from '../../../common/guards/tenant-access.guard';
import { HybridPermissionsGuard } from '../../../common/guards/hybrid-permissions.guard';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
@UseGuards(AuthenticatedGuard, TenantAccessGuard, HybridPermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener mis notificaciones (paginado)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista paginada de notificaciones' })
  async getMyNotifications(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const memberId: string = req.workspaceMember?.id;
    return this.service.getMyNotifications(memberId, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Obtener cantidad de notificaciones no leídas' })
  @ApiResponse({ status: 200, description: '{ count: number }' })
  async getUnreadCount(@Request() req: any) {
    const memberId: string = req.workspaceMember?.id;
    const count = await this.service.getUnreadCount(memberId);
    return { count };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  async markAllAsRead(@Request() req: any) {
    const memberId: string = req.workspaceMember?.id;
    await this.service.markAllAsRead(memberId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ) {
    const memberId: string = req.workspaceMember?.id;
    await this.service.markAsRead(id, memberId);
  }
}
