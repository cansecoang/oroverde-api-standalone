import { Injectable, Logger } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  /**
   * Purga todas las sesiones activas de un usuario específico en Redis.
   * Escanea las keys con prefijo `saas_sess:*`, deserializa cada sesión
   * y elimina las que pertenecen al userId indicado.
   */
  async purgeUserSessions(userId: string): Promise<number> {
    const client = this.buildRedisClient();
    if (!client) {
      this.logger.warn('Redis no configurado — no se pueden purgar sesiones');
      return 0;
    }

    try {
      await client.connect();
    } catch (err) {
      this.logger.error('No se pudo conectar a Redis para purgar sesiones', err);
      return 0;
    }

    try {
      let purged = 0;
      let cursor = 0;

      do {
        const result = await client.scan(cursor, {
          MATCH: 'saas_sess:*',
          COUNT: 100,
        });
        cursor = result.cursor;

        for (const key of result.keys) {
          const raw = await client.get(key);
          if (!raw) continue;

          try {
            const session = JSON.parse(raw);
            const sessionUserId = session?.passport?.user?.id;
            if (sessionUserId === userId) {
              await client.del(key);
              purged++;
            }
          } catch {
            // Sesión con formato inválido — ignorar
          }
        }
      } while (cursor !== 0);

      this.logger.log(
        `Purgadas ${purged} sesión(es) del usuario ${userId}`,
      );
      return purged;
    } catch (err) {
      this.logger.error(
        `Error purgando sesiones del usuario ${userId}`,
        err,
      );
      return 0;
    } finally {
      await client.quit().catch(() => {});
    }
  }

  private buildRedisClient() {
    // Prioridad 1: Variables separadas (REDIS_HOST + REDIS_PASSWORD)
    const host = (process.env.REDIS_HOST || '').trim();
    const password = (process.env.REDIS_PASSWORD || '').trim();

    if (host && password) {
      const rawPort = (process.env.REDIS_PORT || '').trim();
      const parsedPort = Number.parseInt(rawPort, 10);
      const port = Number.isFinite(parsedPort) ? parsedPort : 6380;

      const tlsRaw = (process.env.REDIS_TLS || '').trim().toLowerCase();
      const tlsEnabled = tlsRaw
        ? tlsRaw === 'true'
        : port === 6380 ||
          port === 10000 ||
          host.endsWith('.redis.cache.windows.net') ||
          host.endsWith('.redis.azure.net');

      const username =
        (process.env.REDIS_USERNAME || '').trim() || 'default';

      return createClient({
        socket: {
          host,
          port,
          tls: tlsEnabled ? true : undefined,
        },
        username,
        password,
      });
    }

    // Prioridad 2: REDIS_URL
    const redisUrl = (process.env.REDIS_URL || '').trim();
    if (redisUrl) {
      return createClient({ url: redisUrl });
    }

    // Sin configuración Redis
    return null;
  }
}
