import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../errors/app-error.js';
import { z } from '../zod.js';
import { PageResult } from './page.js';
import { errorResponseSchema, successEnvelope } from './responses.js';
import type { AuthContext, RequestMeta, Role } from './types.js';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type SuccessStatus = 200 | 201 | 204;

interface BaseContext<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  meta: RequestMeta;
}

export type PublicContext<B, Q, P> = BaseContext<B, Q, P>;
export interface AuthedContext<B, Q, P> extends BaseContext<B, Q, P> {
  auth: AuthContext;
}

interface BaseDefinition<B, Q, P> {
  method: HttpMethod;
  /** Express-style path relative to the API prefix, e.g. `/tasks/:id`. */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
  /** Schema of `data` in the success envelope, used for documentation. */
  response?: z.ZodType;
  paginated?: boolean;
  status?: SuccessStatus;
  /** Extra middleware such as a stricter rate limiter. Runs before validation. */
  middleware?: RequestHandler[];
}

export interface PublicRouteDefinition<B, Q, P> extends BaseDefinition<B, Q, P> {
  access: 'public';
  handler: (ctx: PublicContext<B, Q, P>) => Promise<unknown>;
}

export interface AuthedRouteDefinition<B, Q, P> extends BaseDefinition<B, Q, P> {
  /** `user` admits any signed-in role; a role name admits only that role. */
  access: 'user' | Role;
  handler: (ctx: AuthedContext<B, Q, P>) => Promise<unknown>;
}

export interface RouteDependencies {
  authenticate: RequestHandler;
}

/** A route with its generics erased so routes of different shapes can share one list. */
export interface Route {
  method: HttpMethod;
  path: string;
  mount(router: Router, deps: RouteDependencies): void;
  document(registry: OpenAPIRegistry, prefix: string): void;
}

function toDetails(error: z.ZodError, location: string) {
  return error.issues.map((issue) => ({
    path: [location, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

function parsePart<T>(schema: z.ZodType<T> | undefined, value: unknown, location: string): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new ValidationError('The request is not valid', toDetails(result.error, location));
  return result.data;
}

function requestMeta(req: Request, res: Response): RequestMeta {
  return {
    requestId: res.locals.requestId,
    ip: req.ip ?? 'unknown',
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
  };
}

function send(res: Response, status: SuccessStatus, result: unknown): void {
  if (status === 204) {
    res.status(204).end();
    return;
  }
  if (result instanceof PageResult) {
    res.status(status).json({ success: true, data: result.items, meta: result.meta });
    return;
  }
  res.status(status).json({ success: true, data: result ?? null });
}

function authorize(access: 'user' | Role, res: Response): AuthContext {
  const auth = res.locals.auth;
  if (!auth) throw new UnauthorizedError();
  if (access !== 'user' && auth.role !== access) throw new ForbiddenError();
  return auth;
}

function openApiPath(prefix: string, path: string): string {
  return `${prefix}${path.replace(/:(\w+)/g, '{$1}')}`;
}

function documentRoute<B, Q, P>(
  definition: BaseDefinition<B, Q, P> & { access: string },
  registry: OpenAPIRegistry,
  prefix: string,
): void {
  const status = definition.status ?? 200;
  const errorContent = { 'application/json': { schema: errorResponseSchema } };
  const responses: RouteConfig['responses'] = {
    [status]: {
      description: status === 204 ? 'No content' : 'Success',
      ...(status !== 204
        ? {
            content: {
              'application/json': {
                schema: successEnvelope(definition.response ?? z.unknown(), definition.paginated),
              },
            },
          }
        : {}),
    },
    400: { description: 'Validation error', content: errorContent },
    429: { description: 'Too many requests', content: errorContent },
    500: { description: 'Unexpected error', content: errorContent },
  };
  if (definition.access !== 'public') {
    responses[401] = { description: 'Missing or invalid access token', content: errorContent };
    if (definition.access !== 'user') responses[403] = { description: 'Role not allowed', content: errorContent };
  }
  if (definition.path.includes(':')) responses[404] = { description: 'Not found', content: errorContent };

  const request: RouteConfig['request'] = {};
  if (definition.body) request.body = { content: { 'application/json': { schema: definition.body } }, required: true };
  if (definition.query instanceof z.ZodObject) request.query = definition.query;
  if (definition.params instanceof z.ZodObject) request.params = definition.params;

  registry.registerPath({
    method: definition.method,
    path: openApiPath(prefix, definition.path),
    summary: definition.summary,
    description: definition.description,
    tags: definition.tags,
    security: definition.access === 'public' ? [] : [{ bearerAuth: [] }],
    request,
    responses,
  });
}

function wrap(run: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    run(req, res).catch(next);
  };
}

export function defineRoute<B = unknown, Q = unknown, P = unknown>(
  definition: PublicRouteDefinition<B, Q, P> | AuthedRouteDefinition<B, Q, P>,
): Route {
  const status = definition.status ?? 200;

  const execute = wrap(async (req, res) => {
    const parts: BaseContext<B, Q, P> = {
      params: parsePart(definition.params, req.params, 'params'),
      query: parsePart(definition.query, req.query, 'query'),
      body: parsePart(definition.body, req.body, 'body'),
      meta: requestMeta(req, res),
    };
    const result =
      definition.access === 'public'
        ? await definition.handler(parts)
        : await definition.handler({ ...parts, auth: authorize(definition.access, res) });
    send(res, status, result);
  });

  return {
    method: definition.method,
    path: definition.path,
    mount(router, deps) {
      const chain: RequestHandler[] = [];
      if (definition.access !== 'public') chain.push(deps.authenticate);
      chain.push(...(definition.middleware ?? []), execute);
      router[definition.method](definition.path, ...chain);
    },
    document(registry, prefix) {
      documentRoute(definition, registry, prefix);
    },
  };
}
