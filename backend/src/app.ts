import compression from 'compression';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmetImport, { type HelmetOptions } from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Container } from './container.js';
import type { AppConfig } from './config/env.js';
import type { Logger } from 'pino';
import { createErrorHandler, notFoundHandler } from './common/middleware/error-handler.js';
import { requestId } from './common/middleware/request-id.js';
import { buildOpenApiDocument } from './docs/openapi.js';

export const API_PREFIX = '/api/v1';

/**
 * helmet ships separate ESM and CommonJS type files. Vercel's type checker reads the CommonJS one,
 * where the default import is typed as the whole module object, so take `.default` when present.
 * At runtime Node hands us the helmet function either way.
 */
const helmet = ((helmetImport as unknown as { default?: unknown }).default ?? helmetImport) as (
  options?: Readonly<HelmetOptions>,
) => RequestHandler;

export function createApp(config: AppConfig, logger: Logger, container: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => res.locals.requestId,
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      // "*" allows any web origin. Safe because auth uses Bearer tokens, never cookies.
      origin: config.CORS_ORIGINS.includes('*')
        ? '*'
        : (origin, callback) => callback(null, !origin || config.CORS_ORIGINS.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb', strict: true }));

  if (config.API_DOCS_ENABLED) {
    const openApi = buildOpenApiDocument(container.routes, API_PREFIX);
    app.get('/docs/openapi.json', (_req, res) => {
      res.json(openApi);
    });
    // Swagger UI needs inline scripts; relax CSP for the docs page only.
    app.use(
      '/docs',
      helmet({ contentSecurityPolicy: false }),
      swaggerUi.serve,
      swaggerUi.setup(openApi, { customSiteTitle: 'Study Planner API' }),
    );
  }

  const api = express.Router();
  api.use(container.rateLimiters.global);
  for (const route of container.routes) route.mount(api, { authenticate: container.authenticate });
  app.use(API_PREFIX, api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger, config.NODE_ENV === 'development'));
  return app;
}
