import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { Route } from '../common/http/route.js';

export type OpenApiDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

export function buildOpenApiDocument(routes: Route[], prefix: string): OpenApiDocument {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  for (const route of routes) route.document(registry, prefix);
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Study Planner API',
      version: '1.0.0',
      description:
        'REST API for the Study Planner app. Every success response is `{ success: true, data, meta? }`; every error is `{ success: false, error: { code, message, details?, requestId } }`.',
    },
    servers: [{ url: '/' }],
  });
}
