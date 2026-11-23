import { ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { PageResult, paginationQuerySchema } from '../../common/http/page.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { idParamsSchema, objectIdSchema } from '../../common/utils/validators.js';
import type { AuditRepository } from '../audit/audit.repository.js';
import type { AuditSink } from '../audit/audit.service.js';
import { userSchema } from '../auth/auth.schemas.js';
import type { UserRepository } from '../users/user.repository.js';

const auditSchema = z
  .object({
    id: z.string(),
    userId: z.string().nullable(),
    action: z.string(),
    ip: z.string(),
    requestId: z.string(),
    meta: z.record(z.string(), z.unknown()),
    at: z.string(),
  })
  .openapi('AuditLog');

export function adminRoutes(
  users: UserRepository,
  audit: AuditRepository,
  auditSink: AuditSink,
): Route[] {
  const tags = ['Admin'];
  return [
    defineRoute({
      method: 'get',
      path: '/admin/users',
      access: 'admin',
      summary: 'List accounts (admin only)',
      tags,
      query: paginationQuerySchema.extend({
        role: z.enum(['student', 'admin']).optional(),
        sort: z.enum(['createdAt', '-createdAt', 'email', '-email']).default('-createdAt'),
      }),
      response: userSchema,
      paginated: true,
      handler: async ({ query }) => {
        const { items, total } = await users.list(query);
        return new PageResult(items, total, query);
      },
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/users/:id/role',
      access: 'admin',
      summary: 'Change an account role (admin only, audited)',
      tags,
      params: idParamsSchema,
      body: z.strictObject({ role: z.enum(['student', 'admin']) }),
      response: userSchema,
      handler: async ({ params, body, auth, meta }) => {
        // Stops an admin from locking every admin out by demoting themselves.
        if (params.id === auth.userId) {
          throw new ConflictError('Ask another admin to change your own role', 'OWN_ROLE');
        }
        const updated = await users.setRole(params.id, body.role);
        if (!updated) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');
        await auditSink.record('admin.role_changed', auth.userId, meta, {
          target: params.id,
          role: body.role,
        });
        return updated;
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/audit-logs',
      access: 'admin',
      summary: 'Security audit trail, newest first (admin only)',
      tags,
      query: paginationQuerySchema.extend({
        action: z.string().max(60).optional(),
        userId: objectIdSchema.optional(),
      }),
      response: auditSchema,
      paginated: true,
      handler: async ({ query }) => {
        const { items, total } = await audit.list(query);
        return new PageResult(items, total, query);
      },
    }),
  ];
}
