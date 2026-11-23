import type { Redis } from 'ioredis';
import { AppError } from '../../common/errors/app-error.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { pingMongo } from '../../database/mongoose.js';
import { pingRedis } from '../../database/redis.js';

/**
 * `isShuttingDown` turns readiness red as soon as SIGTERM arrives, so a load balancer
 * stops routing new requests here while in-flight ones finish.
 */
export function healthRoutes(
  redis: Redis | undefined,
  startedAt: Date,
  isShuttingDown: () => boolean = () => false,
): Route[] {
  const tags = ['Health'];
  return [
    defineRoute({
      method: 'get',
      path: '/health',
      access: 'public',
      summary: 'Liveness: the process is up',
      tags,
      response: z.object({ status: z.literal('ok'), uptimeSeconds: z.number() }),
      handler: () =>
        Promise.resolve({
          status: 'ok' as const,
          uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        }),
    }),
    defineRoute({
      method: 'get',
      path: '/health/ready',
      access: 'public',
      summary: 'Readiness: database (required) and Redis (optional) reachable',
      tags,
      response: z.object({
        status: z.enum(['ready', 'degraded']),
        mongo: z.enum(['ok', 'down']),
        redis: z.enum(['ok', 'disabled', 'down']),
      }),
      handler: async () => {
        if (isShuttingDown())
          throw new AppError(503, 'SHUTTING_DOWN', 'The server is shutting down');
        const [mongoOk, redisState] = await Promise.all([
          pingMongo().catch(() => false),
          pingRedis(redis),
        ]);
        if (!mongoOk) throw new AppError(503, 'NOT_READY', 'Database is not reachable');
        return {
          status: redisState === 'down' ? ('degraded' as const) : ('ready' as const),
          mongo: 'ok' as const,
          redis: redisState,
        };
      },
    }),
  ];
}
