import { Redis } from 'ioredis';
import type { Logger } from 'pino';

/**
 * Creates the optional Redis client used as a shared rate-limit store.
 * Returns undefined when no URL is configured so single-instance setups need no Redis.
 */
export function createRedisClient(url: string | undefined, logger: Logger): Redis | undefined {
  if (!url) {
    logger.info('REDIS_URL not set; rate limits use in-memory storage');
    return undefined;
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  client.on('error', (error: Error) => logger.error({ err: error }, 'Redis error'));
  client.on('ready', () => logger.info('Redis connected'));
  return client;
}

export async function pingRedis(client: Redis | undefined): Promise<'ok' | 'disabled' | 'down'> {
  if (!client) return 'disabled';
  try {
    return (await client.ping()) === 'PONG' ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}
