import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { dateKeySchema, subjectSchema } from '../../common/utils/validators.js';
import { CHAPTER_STATUSES, TASK_KINDS } from '../planner/planner.types.js';
import { taskSchema } from '../tasks/task.dto.js';
import type { ChapterService } from './chapter.service.js';

const keyParams = z.object({ key: z.string().regex(/^[a-z]+-\d{1,2}$/, 'Invalid chapter key') });

const chapterSchema = z
  .object({
    key: z.string(),
    subject: subjectSchema,
    name: z.string(),
    difficulty: z.number().int(),
    status: z.enum(CHAPTER_STATUSES),
    learnedOn: z.string().nullable(),
    revisions: z.number().int(),
    snoozedUntil: z.string().nullable(),
  })
  .openapi('Chapter');

const proposalSchema = z
  .object({
    chapter: chapterSchema,
    exam: z.object({ id: z.string(), name: z.string(), date: z.string() }).nullable(),
    steps: z.array(
      z.object({
        index: z.number().int(),
        title: z.string(),
        mins: z.number().int(),
        kind: z.enum(TASK_KINDS),
        proposedDate: z.string(),
      }),
    ),
    alreadyPlanned: z.array(taskSchema),
    dayOptions: z.array(z.string()),
  })
  .openapi('ScheduleProposal');

export function chapterRoutes(chapters: ChapterService): Route[] {
  const tags = ['Chapters'];
  return [
    defineRoute({
      method: 'get',
      path: '/chapters',
      access: 'user',
      summary: 'Syllabus chapters with status and planned steps',
      tags,
      query: z.object({
        subject: subjectSchema.optional(),
        status: z.enum(CHAPTER_STATUSES).optional(),
      }),
      response: chapterSchema.extend({ plannedCount: z.number().int() }).array(),
      handler: ({ auth, query }) => chapters.list(auth.userId, query),
    }),
    defineRoute({
      method: 'patch',
      path: '/chapters/:key',
      access: 'user',
      summary: 'Update where you are with a chapter',
      tags,
      params: keyParams,
      body: z.strictObject({ status: z.enum(CHAPTER_STATUSES) }),
      response: chapterSchema,
      handler: ({ auth, params, body }) => chapters.setStatus(auth.userId, params.key, body.status),
    }),
    defineRoute({
      method: 'get',
      path: '/chapters/:key/schedule-proposal',
      access: 'user',
      summary: 'Study steps for a chapter with proposed days before its next test',
      tags,
      params: keyParams,
      response: proposalSchema,
      handler: ({ auth, params }) => chapters.proposal(auth.userId, params.key),
    }),
    defineRoute({
      method: 'post',
      path: '/chapters/:key/schedule',
      access: 'user',
      summary: 'Add the chosen steps to the plan on the chosen days',
      tags,
      status: 201,
      params: keyParams,
      body: z.strictObject({
        steps: z
          .array(z.strictObject({ index: z.number().int().min(0).max(10), date: dateKeySchema }))
          .min(1, 'Tick at least one step to add')
          .max(10),
      }),
      response: taskSchema.array(),
      handler: ({ auth, params, body }) => chapters.schedule(auth.userId, params.key, body.steps),
    }),
    defineRoute({
      method: 'post',
      path: '/chapters/:key/revisions',
      access: 'user',
      summary: 'Add a 15-minute spaced revision for today',
      tags,
      status: 201,
      params: keyParams,
      response: z.object({ task: taskSchema, chapter: chapterSchema.nullable() }),
      handler: ({ auth, params }) => chapters.addRevision(auth.userId, params.key),
    }),
    defineRoute({
      method: 'post',
      path: '/chapters/:key/snooze',
      access: 'user',
      summary: 'Remind about this revision tomorrow',
      tags,
      params: keyParams,
      response: chapterSchema.nullable(),
      handler: ({ auth, params }) => chapters.snooze(auth.userId, params.key),
    }),
  ];
}
