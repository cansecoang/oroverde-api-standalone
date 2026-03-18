import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GlobalUser } from '../users/entities/user.entity';
import { SessionService } from '../../../common/services/session.service';

export interface ActiveSessionDto {
  sessionId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  globalRole: string;
  organizationName: string | null;
  ttlSeconds: number;
  expiresAt: string;
  isCurrentSession: boolean;
}

export interface SessionListResponseDto {
  sessions: ActiveSessionDto[];
  stats: {
    total: number;
    uniqueUsers: number;
    redisAvailable: boolean;
  };
}

@Injectable()
export class SessionsAdminService {
  constructor(
    @InjectRepository(GlobalUser) private readonly usersRepo: Repository<GlobalUser>,
    private readonly sessionService: SessionService,
  ) {}

  async listSessions(currentSessionId: string): Promise<SessionListResponseDto> {
    const raw = await this.sessionService.getActiveSessions();

    // Solo sesiones con usuario autenticado
    const authenticated = raw.filter((s) => s.userId !== null);

    if (authenticated.length === 0) {
      return {
        sessions: [],
        stats: { total: 0, uniqueUsers: 0, redisAvailable: raw !== null },
      };
    }

    const userIds = [...new Set(authenticated.map((s) => s.userId as string))];

    const users = await this.usersRepo.find({
      where: { id: In(userIds) },
      relations: ['organization'],
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const sessions: ActiveSessionDto[] = authenticated.map((s) => {
      const user = userMap.get(s.userId!);
      const expiresAt =
        s.expiresAt ?? new Date(Date.now() + s.ttlSeconds * 1000).toISOString();

      return {
        sessionId: s.sessionId,
        userId: s.userId!,
        userFullName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        userEmail: user?.email ?? 'Unknown',
        globalRole: user?.globalRole ?? 'unknown',
        organizationName: (user as any)?.organization?.name ?? null,
        ttlSeconds: s.ttlSeconds,
        expiresAt,
        isCurrentSession: s.sessionId === currentSessionId,
      };
    });

    // Ordenar: sesión actual primero, luego por nombre
    sessions.sort((a, b) => {
      if (a.isCurrentSession) return -1;
      if (b.isCurrentSession) return 1;
      return a.userFullName.localeCompare(b.userFullName);
    });

    const uniqueUsers = new Set(sessions.map((s) => s.userId)).size;

    return {
      sessions,
      stats: {
        total: sessions.length,
        uniqueUsers,
        redisAvailable: true,
      },
    };
  }

  async revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
    const revoked = await this.sessionService.revokeSession(sessionId);
    return { revoked };
  }

  async revokeUserSessions(userId: string): Promise<{ purged: number }> {
    const purged = await this.sessionService.purgeUserSessions(userId);
    return { purged };
  }
}
