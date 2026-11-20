import type { RequestHandler } from 'express';
import { defineRoute, type Route } from '../../common/http/route.js';
import { loginBodySchema, meSchema, refreshBodySchema, registerBodySchema, sessionSchema, tokenPairSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export function authRoutes(auth: AuthService, authLimiter: RequestHandler): Route[] {
  const tags = ['Auth'];
  return [
    defineRoute({
      method: 'post',
      path: '/auth/register',
      access: 'public',
      summary: 'Create a student account',
      tags,
      status: 201,
      middleware: [authLimiter],
      body: registerBodySchema,
      response: sessionSchema,
      handler: ({ body, meta }) => auth.register(body, meta),
    }),
    defineRoute({
      method: 'post',
      path: '/auth/login',
      access: 'public',
      summary: 'Sign in with email and password',
      tags,
      middleware: [authLimiter],
      body: loginBodySchema,
      response: sessionSchema,
      handler: ({ body, meta }) => auth.login(body, meta),
    }),
    defineRoute({
      method: 'post',
      path: '/auth/refresh',
      access: 'public',
      summary: 'Exchange a refresh token for a new token pair (rotation)',
      description: 'Each refresh token works once. Reusing a rotated token revokes every token in its family.',
      tags,
      middleware: [authLimiter],
      body: refreshBodySchema,
      response: tokenPairSchema,
      handler: ({ body, meta }) => auth.refresh(body.refreshToken, meta),
    }),
    defineRoute({
      method: 'post',
      path: '/auth/logout',
      access: 'user',
      summary: 'Sign out this device by revoking its refresh token family',
      tags,
      status: 204,
      body: refreshBodySchema,
      handler: ({ body, meta, auth: who }) => auth.logout(body.refreshToken, meta, who.userId),
    }),
    defineRoute({
      method: 'get',
      path: '/auth/me',
      access: 'user',
      summary: 'Current account and onboarding state',
      tags,
      response: meSchema,
      handler: ({ auth: who }) => auth.me(who.userId),
    }),
  ];
}
