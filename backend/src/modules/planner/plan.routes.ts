import { defineRoute, type Route } from '../../common/http/route.js';
import { acceptAllResultSchema, dayParamsSchema, planDaySchema, scheduleResultSchema, stripDaySchema, stripQuerySchema } from './plan.schemas.js';
import type { PlanService } from './plan.service.js';

export function planRoutes(plan: PlanService): Route[] {
  const tags = ['Plan'];
  return [
    defineRoute({
      method: 'get',
      path: '/plan/days',
      access: 'user',
      summary: 'Day strip: load, limit and markers for a run of days',
      tags,
      query: stripQuerySchema,
      response: stripDaySchema.array(),
      handler: ({ auth, query }) => plan.strip(auth.userId, query.from, query.days),
    }),
    defineRoute({
      method: 'get',
      path: '/plan/days/:date',
      access: 'user',
      summary: 'One day laid out around school, tuition and meals',
      tags,
      params: dayParamsSchema,
      response: planDaySchema,
      handler: ({ auth, params }) => plan.day(auth.userId, params.date),
    }),
    defineRoute({
      method: 'post',
      path: '/plan/auto-schedule',
      access: 'user',
      summary: 'Fill free slots before exams and homework deadlines with suggested blocks',
      tags,
      response: scheduleResultSchema,
      handler: ({ auth }) => plan.autoSchedule(auth.userId),
    }),
    defineRoute({
      method: 'post',
      path: '/plan/accept-all',
      access: 'user',
      summary: 'Accept every suggested block from today onwards',
      tags,
      response: acceptAllResultSchema,
      handler: ({ auth }) => plan.acceptAll(auth.userId),
    }),
  ];
}
