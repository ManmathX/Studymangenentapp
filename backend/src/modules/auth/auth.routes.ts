import type { RequestHandler } from 'express';
import { defineRoute, type Route } from '../../common/http/route.js';
import type { AccountService } from './account.service.js';
import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  forgotPasswordBodySchema,
  googleLoginBodySchema,
  loginBodySchema,
  meSchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  sessionSchema,
  tokenPairSchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import type { PasswordResetService } from './password-reset.service.js';

export function authRoutes(
  auth: AuthService,
  accounts: AccountService,
  resets: PasswordResetService,
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
      path: '/auth/google',
      access: 'public',
      summary: 'Sign in (or sign up) with a Google ID token',
      description:
        'Links to an existing account with the same verified email. Returns 503 GOOGLE_NOT_CONFIGURED when the server has no GOOGLE_CLIENT_IDS.',
      tags,
      middleware: [authLimiter],
      body: googleLoginBodySchema,
      response: sessionSchema,
      handler: ({ body, meta }) => auth.googleLogin(body.idToken, meta),
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
      summary: 'Current account',
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
      method: 'post',
      path: '/auth/password/forgot',
      access: 'public',
      summary: 'Email a 6-digit code for setting a new password',
      description:
        'Answers 204 whether or not the email has an account. A new code is sent at most once a minute. Returns 503 PASSWORD_RESET_UNAVAILABLE when the server has no SMTP_URL.',
      tags,
      status: 204,
      middleware: [authLimiter],
      body: forgotPasswordBodySchema,
      handler: ({ body, meta }) => resets.requestCode(body.email, meta),
    }),
    defineRoute({
      method: 'post',
      path: '/auth/password/reset',
      access: 'public',
      summary: 'Set a new password with the emailed code (signs out every device)',
      description:
        'A code works for PASSWORD_RESET_CODE_TTL_MINUTES and stops working after 5 wrong tries. Sign in with the new password afterwards.',
      tags,
      status: 204,
      middleware: [authLimiter],
      body: resetPasswordBodySchema,
      handler: ({ body, meta }) => resets.resetPassword(body, meta),
    }),
    defineRoute({
      method: 'delete',
      path: '/auth/account',
      access: 'user',
      summary: 'Permanently delete the account',
      description:
        'Needs the password. Removes the login and every session. Students’ plans live on their phones; the app deletes those. This cannot be undone.',
      tags,
      status: 204,
      middleware: [authLimiter],
      body: deleteAccountBodySchema,
      handler: ({ body, meta, auth: who }) =>
        accounts.deleteAccount(who.userId, body.password, meta),
    }),
  ];
}
