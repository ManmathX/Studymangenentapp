import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { idParamsSchema, subjectSchema } from '../../common/utils/validators.js';
import { SUGGESTION_KINDS, SUGGESTION_SOURCES, SUGGESTION_STATES } from './suggestion.model.js';
import type { SuggestionService } from './suggestion.service.js';

export const suggestionSchema = z
  .object({
    id: z.string(),
    from: z.enum(SUGGESTION_SOURCES),
    who: z.string(),
    role: z.string(),
    subject: subjectSchema,
    title: z.string(),
    mins: z.number().int(),
    date: z.string(),
    kind: z.enum(SUGGESTION_KINDS),
    taskId: z.string().nullable(),
    chapterKey: z.string().nullable(),
    note: z.string(),
    state: z.enum(SUGGESTION_STATES),
  })
  .openapi('Suggestion');

export function suggestionRoutes(suggestions: SuggestionService): Route[] {
  const tags = ['Suggestions'];
  const action = (name: 'accept' | 'later' | 'skip' | 'swap', summary: string) =>
    defineRoute({
      method: 'post',
      path: `/suggestions/:id/${name}`,
      access: 'user',
      summary,
      tags,
      params: idParamsSchema,
      response: suggestionSchema,
      handler: ({ auth, params }) => suggestions[name](auth.userId, params.id),
    });
  return [
    defineRoute({
      method: 'get',
      path: '/suggestions',
      access: 'user',
      summary: 'Suggestions by state (comma-separated, default pending)',
      tags,
      query: z.object({
        state: z
          .string()
          .default('pending')
          .transform((value) => value.split(',').map((part) => part.trim()))
          .pipe(z.array(z.enum(SUGGESTION_STATES)).min(1).max(4)),
      }),
      response: suggestionSchema.array(),
      handler: ({ auth, query }) => suggestions.list(auth.userId, query.state),
    }),
    action('accept', 'Accept: add or move the block on its suggested day'),
    action('later', 'Save for later'),
    action('skip', 'Skip: the plan stays as it is'),
    action('swap', 'Accept on another day with more room'),
  ];
}
