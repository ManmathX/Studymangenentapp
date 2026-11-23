import { PageResult, paginationQuerySchema } from '../../common/http/page.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import {
  dateKeySchema,
  idParamsSchema,
  subjectSchema,
  trimmedText,
} from '../../common/utils/validators.js';
import { taskSchema } from '../tasks/task.dto.js';
import type { HomeworkService } from './homework.service.js';

const homeworkSchema = z
  .object({
    id: z.string(),
    subject: subjectSchema,
    title: z.string(),
    note: z.string(),
    teacher: z.string(),
    due: z.string(),
    mins: z.number().int(),
    difficulty: z.number().int(),
    weight: z.number().int(),
    done: z.boolean(),
    doneOn: z.string().nullable(),
  })
  .openapi('Homework');

export function homeworkRoutes(homework: HomeworkService): Route[] {
  const tags = ['Homework'];
  return [
    defineRoute({
      method: 'get',
      path: '/homework',
      access: 'user',
      summary: 'Open homework (by due date) or done homework (newest first), paginated',
      tags,
      query: paginationQuerySchema.extend({ status: z.enum(['open', 'done']).default('open') }),
      response: homeworkSchema,
      paginated: true,
      handler: async ({ auth, query }) => {
        const { items, total } = await homework.page(auth.userId, query.status === 'done', query);
        return new PageResult(items, total, query);
      },
    }),
    defineRoute({
      method: 'get',
      path: '/homework/summary',
      access: 'user',
      summary: 'Counts for the homework header',
      tags,
      response: z.object({
        today: z.string(),
        dueThisWeek: z.number().int(),
        overdue: z.number().int(),
        doneThisWeek: z.number().int(),
      }),
      handler: ({ auth }) => homework.summary(auth.userId),
    }),
    defineRoute({
      method: 'post',
      path: '/homework',
      access: 'user',
      summary: 'Add homework; a task is planned for the day before it is due',
      tags,
      status: 201,
      body: z
        .strictObject({
          subject: subjectSchema,
          title: trimmedText(1, 140),
          note: z.string().trim().max(500).default(''),
          due: dateKeySchema,
          mins: z.number().int().min(5).max(240),
          difficulty: z.number().int().min(1).max(3),
        })
        .openapi('NewHomework'),
      response: z.object({ homework: homeworkSchema, task: taskSchema }),
      handler: ({ auth, body }) => homework.create(auth.userId, body),
    }),
    defineRoute({
      method: 'patch',
      path: '/homework/:id',
      access: 'user',
      summary: 'Mark homework done or pending',
      tags,
      params: idParamsSchema,
      body: z.strictObject({ done: z.boolean() }),
      response: homeworkSchema,
      handler: ({ auth, params, body }) => homework.setDone(auth.userId, params.id, body.done),
    }),
    defineRoute({
      method: 'delete',
      path: '/homework/:id',
      access: 'user',
      summary: 'Delete homework and its unfinished tasks',
      tags,
      status: 204,
      params: idParamsSchema,
      handler: ({ auth, params }) => homework.remove(auth.userId, params.id),
    }),
  ];
}
