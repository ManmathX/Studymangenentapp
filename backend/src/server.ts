import type { Server } from 'node:http';
import { createApp } from './app.js';
import { buildContainer } from './container.js';
import { loadConfig, loadDotEnvIfPresent } from './config/env.js';
import { createLogger } from './config/logger.js';
import { connectMongo, disconnectMongo } from './database/mongoose.js';
import { createRedisClient } from './database/redis.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const logger = createLogger(config);

  await connectMongo(
    { uri: config.MONGODB_URI, maxPoolSize: config.MONGODB_MAX_POOL_SIZE, autoIndex: config.NODE_ENV !== 'production' },
    logger,
  );
  const redis = createRedisClient(config.REDIS_URL, logger);
  if (redis) {
    await redis.connect().catch((error: unknown) => logger.warn({ err: error }, 'Redis unavailable; rate limits fail open'));
  }

  const app = createApp(config, logger, buildContainer({ config, logger, redis }));
  const server: Server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, docs: `http://localhost:${config.PORT}/docs` }, 'Study Planner API listening');
  });
  server.keepAliveTimeout = 65_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => {
      logger.error('Forced exit after shutdown timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    server.close((closeError) => {
      if (closeError) logger.error({ err: closeError }, 'HTTP server close failed');
      Promise.allSettled([disconnectMongo(), redis?.quit()])
        .then((results) => {
          for (const result of results) if (result.status === 'rejected') logger.error({ err: result.reason as unknown }, 'Shutdown step failed');
          process.exit(closeError ? 1 : 0);
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Shutdown failed');
          process.exit(1);
        });
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
}

main().catch((error: unknown) => {
  console.error('Failed to start the API:', error);
  process.exit(1);
});
