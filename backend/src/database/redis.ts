import { Redis, type RedisOptions } from 'ioredis';
import type { Logger } from 'pino';

/**
 * TLS settings for `rediss://` URLs. Hosted Redis (Layerbase, Upstash, Redis Cloud…) often routes
 * connections by TLS server name, so the host name must be sent as SNI or the server refuses
 * the connection ("ERR TLS SNI required").
 */
export function tlsOptionsFor(url: string): RedisOptions['tls'] | undefined {
  const parsed = new URL(url);
  return parsed.protocol === 'rediss:' ? { servername: parsed.hostname } : undefined;
}

/**
 * What is safe to log about a Redis error. ioredis attaches the failed command, and for AUTH its
 * arguments are the username and password, so the error object itself must never be logged.
 */
function describeError(error: Error & { code?: string; command?: { name?: string } }) {
  return {
    type: error.name,
    message: error.message,
    code: error.code,
    command: error.command?.name,
  };
}

/**
 * Creates the optional Redis client used as a shared rate-limit store.
 * Returns undefined when no URL is configured so single-instance setups need no Redis.
 */
export function createRedisClient(url: string | undefined, logger: Logger): Redis | undefined {
  if (!url) {
    logger.info('REDIS_URL not set; rate limits use in-memory storage');
    return undefined;
  }
  const tls = tlsOptionsFor(url);
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: true,
    ...(tls ? { tls } : {}),
  });
  client.on('error', (error: Error) =>
    logger.error({ redis: describeError(error) }, 'Redis error'),
  );
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
