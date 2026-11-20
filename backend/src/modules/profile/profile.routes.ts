import { defineRoute, type Route } from '../../common/http/route.js';
import { demoBodySchema, onboardingBodySchema, onboardingResultSchema, profilePatchSchema, profileSchema } from './profile.schemas.js';
import type { OnboardingService } from './onboarding.service.js';
import type { ProfileService } from './profile.service.js';

export function profileRoutes(profiles: ProfileService, onboarding: OnboardingService): Route[] {
  const tags = ['Profile'];
  return [
    defineRoute({
      method: 'post',
      path: '/onboarding',
      access: 'user',
      summary: 'Finish first-time setup and build the first plan',
      tags,
      status: 201,
      body: onboardingBodySchema,
      response: onboardingResultSchema,
      handler: ({ auth, body }) => onboarding.onboard(auth.userId, body),
    }),
    defineRoute({
      method: 'post',
      path: '/onboarding/demo',
      access: 'user',
      summary: 'Load the demo student (replaces any existing planner data)',
      tags,
      status: 201,
      body: demoBodySchema,
      response: onboardingResultSchema,
      handler: ({ auth, body, meta }) => onboarding.seedDemo(auth.userId, body.timezone, meta),
    }),
    defineRoute({
      method: 'get',
      path: '/profile',
      access: 'user',
      summary: 'Planner profile and preferences',
      tags,
      response: profileSchema,
      handler: ({ auth }) => profiles.get(auth.userId),
    }),
    defineRoute({
      method: 'patch',
      path: '/profile',
      access: 'user',
      summary: 'Change age mode, exam season, time zone or sharing settings',
      tags,
      body: profilePatchSchema,
      response: profileSchema,
      handler: ({ auth, body }) => profiles.update(auth.userId, body),
    }),
    defineRoute({
      method: 'delete',
      path: '/profile/data',
      access: 'user',
      summary: 'Start over: delete all planner data (the account stays)',
      tags,
      status: 204,
      handler: ({ auth, meta }) => onboarding.wipe(auth.userId, meta),
    }),
  ];
}
