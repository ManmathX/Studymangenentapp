import type { Express } from 'express';
import { createApp } from './app.js';
import { buildContainer } from './container.js';
import { loadConfig, loadDotEnvIfPresent } from './config/env.js';
import { createLogger } from './config/logger.js';
import { connectMongo, disconnectMongo } from './database/mongoose.js';
import { createRedisClient } from './database/redis.js';

/**
 * Start-up for Vercel's serverless functions (the root index.ts is the entry Vercel loads;
 * src/server.ts stays the entry for Docker and local dev). A function instance builds the API
 * on its first request and reuses it, with its MongoDB and Redis connections, for every later
 * request it serves. Vercel owns the process lifecycle, so there is no listen() or signal handling.
 */
let ready: Promise<Express> | undefined;

async function init(): Promise<Express> {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const logger = createLogger(config);
  try {
    await connectMongo(
      {
        uri: config.MONGODB_URI,
        maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
        autoIndex: config.NODE_ENV !== 'production',
      },
      logger,
    );
  } catch (error) {
    // Leave mongoose disconnected so the next request retries from a clean state.
    await disconnectMongo().catch(() => undefined);
    throw error;
  }
  const redis = createRedisClient(config.REDIS_URL, logger);
  if (redis) {
    await redis
      .connect()
      .catch((error: unknown) =>
        logger.warn({ err: error }, 'Redis unavailable; rate limits fail open'),
      );
  }
  const container = buildContainer({ config, logger, redis });
  return createApp(config, logger, container);
}

/** The API for this function instance, built once. A failed start-up is retried on the next call. */
export function loadApp(): Promise<Express> {
  ready ??= init().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
