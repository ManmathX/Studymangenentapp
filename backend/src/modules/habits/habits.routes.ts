import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { dateKeySchema, subjectSchema } from '../../common/utils/validators.js';
import { SCREEN_TIME_OPTIONS } from './daily-log.model.js';
import type { HabitsService } from './habits.service.js';

const dailyLogSchema = z
  .object({
    date: z.string(),
    rest: z.boolean(),
    checkin: z
      .object({
        sleep: z.number(),
        breaks: z.number().int(),
        screen: z.enum(SCREEN_TIME_OPTIONS),
        saved: z.boolean(),
      })
      .nullable(),
    routines: z.object({ morning: z.array(z.boolean()), evening: z.array(z.boolean()) }).nullable(),
    bag: z.record(z.string(), z.boolean()),
  })
  .openapi('DailyLog');

const bagSchema = z
  .object({
    date: z.string(),
    periods: z.array(z.object({ number: z.number().int(), id: z.string(), label: z.string() })),
    items: z.array(z.object({ id: z.string(), label: z.string(), checked: z.boolean() })),
    packed: z.number().int(),
  })
  .openapi('Bag');

const threeTicks = z.array(z.boolean()).length(3);

export function habitsRoutes(habits: HabitsService): Route[] {
  const tags = ['Habits'];
  return [
    defineRoute({
      method: 'post',
      path: '/focus-sessions',
      access: 'user',
      summary: 'Log a finished focus session to a subject',
      tags,
      status: 201,
      body: z.strictObject({ subject: subjectSchema, mins: z.number().int().min(1).max(240) }),
      response: z.object({
        id: z.string(),
        date: z.string(),
        subject: subjectSchema,
        mins: z.number().int(),
      }),
      handler: ({ auth, body }) => habits.logFocus(auth.userId, body),
    }),
    defineRoute({
      method: 'post',
      path: '/daily-logs/today/rest',
      access: 'user',
      summary: 'Take today as a rest day (keeps the streak; two per week)',
      tags,
      response: dailyLogSchema,
      handler: ({ auth }) => habits.takeRestDay(auth.userId),
    }),
    defineRoute({
      method: 'put',
      path: '/daily-logs/today/checkin',
      access: 'user',
      summary: 'Save today’s wellbeing check-in (private to the student)',
      tags,
      body: z.strictObject({
        sleep: z.number().min(3).max(12).multipleOf(0.5),
        breaks: z.number().int().min(0).max(12),
        screen: z.enum(SCREEN_TIME_OPTIONS),
      }),
      response: dailyLogSchema,
      handler: ({ auth, body }) => habits.saveCheckin(auth.userId, body),
    }),
    defineRoute({
      method: 'put',
      path: '/daily-logs/today/routines',
      access: 'user',
      summary: 'Save morning review and evening recap ticks',
      tags,
      body: z.strictObject({ morning: threeTicks, evening: threeTicks }),
      response: dailyLogSchema,
      handler: ({ auth, body }) => habits.saveRoutines(auth.userId, body),
    }),
    defineRoute({
      method: 'get',
      path: '/bag',
      access: 'user',
      summary: 'Bag checklist from the timetable and homework due (default: next school day)',
      tags,
      query: z.object({ date: dateKeySchema.optional() }),
      response: bagSchema,
      handler: ({ auth, query }) => habits.bag(auth.userId, query.date),
    }),
    defineRoute({
      method: 'put',
      path: '/bag/:date/items/:itemId',
      access: 'user',
      summary: 'Tick or untick a bag item',
      tags,
      params: z.object({
        date: dateKeySchema,
        itemId: z.string().regex(/^[A-Za-z0-9-]{1,40}$/, 'Invalid item'),
      }),
      body: z.strictObject({ checked: z.boolean() }),
      response: bagSchema,
      handler: ({ auth, params, body }) =>
        habits.setBagItem(auth.userId, params.date, params.itemId, body.checked),
    }),
  ];
}
