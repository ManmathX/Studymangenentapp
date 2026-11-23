import type { Request, RequestHandler, Response } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';

export interface RateLimitSettings {
  enabled: boolean;
  globalPerMinute: number;
  authPerWindow: number;
  authWindowMinutes: number;
}

export interface RateLimiters {
  global: RequestHandler;
  auth: RequestHandler;
}

const passThrough: RequestHandler = (_req, _res, next) => next();

function tooManyRequests(_req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
      requestId: res.locals.requestId,
    },
  });
}

function storeFor(redis: Redis | undefined, prefix: string): Partial<Options> {
  if (!redis) return {};
  return {
    store: new RedisStore({
      prefix,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    }),
  };
}

export function createRateLimiters(settings: RateLimitSettings, redis?: Redis): RateLimiters {
  if (!settings.enabled) return { global: passThrough, auth: passThrough };
  const common: Partial<Options> = {
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests,
    // Fail open: a Redis outage must not take the API down; the error is logged by the client.
    passOnStoreError: true,
  };
  return {
    global: rateLimit({
      ...common,
      ...storeFor(redis, 'rl:global:'),
      windowMs: 60_000,
      limit: settings.globalPerMinute,
      // Load-balancer and orchestrator probes poll often from a few IPs; never throttle them.
      skip: (req) => req.path === '/health' || req.path === '/health/ready',
    }),
    auth: rateLimit({
      ...common,
      ...storeFor(redis, 'rl:auth:'),
      windowMs: settings.authWindowMinutes * 60_000,
      limit: settings.authPerWindow,
    }),
  };
}
