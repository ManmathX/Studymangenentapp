import { defineRoute, type Route } from '../../common/http/route.js';
import type { DashboardService } from './dashboard.service.js';

export function dashboardRoutes(dashboard: DashboardService): Route[] {
  const tags = ['Dashboard'];
  return [
    defineRoute({
      method: 'get',
      path: '/dashboard/today',
      access: 'user',
      summary: 'Today screen: next test, timed plan, rings, suggestions, heavy-day warning',
      tags,
      handler: ({ auth }) => dashboard.today(auth.userId),
    }),
    defineRoute({
      method: 'get',
      path: '/dashboard/progress',
      access: 'user',
      summary: 'Progress screen: syllabus coverage, study hours, test readiness, slipped tasks',
      tags,
      handler: ({ auth }) => dashboard.progress(auth.userId),
    }),
    defineRoute({
      method: 'get',
      path: '/dashboard/habits',
      access: 'user',
      summary:
        'Habits screen: streak calendar, focus sessions, check-in, routines, revision nudges',
      tags,
      handler: ({ auth }) => dashboard.habitsOverview(auth.userId),
    }),
    defineRoute({
      method: 'get',
      path: '/dashboard/sharing',
      access: 'user',
      summary: 'Privacy screen: sharing settings, parent summary preview, saved suggestions',
      tags,
      handler: ({ auth }) => dashboard.sharing(auth.userId),
    }),
  ];
}
