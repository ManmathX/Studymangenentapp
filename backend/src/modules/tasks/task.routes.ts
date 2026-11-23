import { PageResult, paginationQuerySchema } from '../../common/http/page.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { dateKeySchema, idParamsSchema } from '../../common/utils/validators.js';
import { TASK_STATUSES } from '../planner/planner.types.js';
import { taskSchema } from './task.dto.js';
import type { TaskService } from './task.service.js';

const actionRoute = (
  path: string,
  summary: string,
  run: (userId: string, id: string) => Promise<unknown>,
) =>
  defineRoute({
    method: 'post',
    path,
    access: 'user',
    summary,
    tags: ['Tasks'],
    params: idParamsSchema,
    response: taskSchema,
    handler: ({ auth, params }) => run(auth.userId, params.id),
  });

export function taskRoutes(tasks: TaskService): Route[] {
  const tags = ['Tasks'];
  const listQuery = paginationQuerySchema.extend({
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    sort: z.enum(['date', '-date']).default('date'),
  });
  return [
    defineRoute({
      method: 'get',
      path: '/tasks',
      access: 'user',
      summary: 'Tasks, filtered by date range and status, paginated',
      tags,
      query: listQuery,
      response: taskSchema,
      paginated: true,
      handler: async ({ auth, query }) => {
        const { items, total } = await tasks.page(auth.userId, query);
        return new PageResult(items, total, query);
      },
    }),
    defineRoute({
      method: 'patch',
      path: '/tasks/:id',
      access: 'user',
      summary: 'Mark done or not done, or move to another day',
      tags,
      params: idParamsSchema,
      body: z
        .strictObject({ done: z.boolean().optional(), date: dateKeySchema.optional() })
        .refine((body) => body.done !== undefined || body.date !== undefined, 'Send done or date'),
      response: z.object({
        task: taskSchema,
        homework: z.unknown().nullable(),
        chapter: z.unknown().nullable(),
      }),
      handler: ({ auth, params, body }) => tasks.update(auth.userId, params.id, body),
    }),
    actionRoute('/tasks/:id/accept', 'Accept a suggested block into the plan', (userId, id) =>
      tasks.accept(userId, id),
    ),
    actionRoute('/tasks/:id/skip', 'Skip a block; it stops counting toward the day', (userId, id) =>
      tasks.skip(userId, id),
    ),
    actionRoute(
      '/tasks/:id/swap',
      'Move a suggested block to the best other day and accept it',
      (userId, id) => tasks.swap(userId, id),
    ),
    actionRoute(
      '/tasks/:id/move',
      'Move a block to the nearby day with the most room',
      (userId, id) => tasks.moveToBestDay(userId, id),
    ),
  ];
}
