import type { RequestHandler } from 'express';
import { defineRoute, type Route } from '../../common/http/route.js';
import type { AccountService } from './account.service.js';
import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  loginBodySchema,
  meSchema,
  refreshBodySchema,
  registerBodySchema,
  sessionSchema,
  tokenPairSchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export function authRoutes(
  auth: AuthService,
  accounts: AccountService,
  authLimiter: RequestHandler,
): Route[] {
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
      description:
        'Each refresh token works once. Reusing a rotated token revokes every token in its family.',
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
    defineRoute({
      method: 'post',
      path: '/auth/password',
      access: 'user',
      summary: 'Change password (signs out every other device)',
      description:
        'Needs the current password. Every refresh token for the account is revoked and a new pair is returned for this device.',
      tags,
      middleware: [authLimiter],
      body: changePasswordBodySchema,
      response: tokenPairSchema,
      handler: ({ body, meta, auth: who }) => auth.changePassword(who.userId, body, meta),
    }),
    defineRoute({
      method: 'delete',
      path: '/auth/account',
      access: 'user',
      summary: 'Permanently delete the account and all its data',
      description:
        'Needs the password. Removes the login, every planner record and every session. This cannot be undone.',
      tags,
      status: 204,
      middleware: [authLimiter],
      body: deleteAccountBodySchema,
      handler: ({ body, meta, auth: who }) =>
        accounts.deleteAccount(who.userId, body.password, meta),
    }),
  ];
}
