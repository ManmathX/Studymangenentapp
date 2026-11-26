import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import {
  chapterKeySchema,
  dateKeySchema,
  idParamsSchema,
  subjectSchema,
  trimmedText,
} from '../../common/utils/validators.js';
import { CHAPTER_STATUSES } from '../planner/planner.types.js';
import { EXAM_KINDS } from './exam.model.js';
import type { ExamService } from './exam.service.js';

const chapterKeysSchema = z
  .array(chapterKeySchema)
  .min(1, 'Tick at least one chapter so the planner knows what to revise')
  .max(40);

const examSchema = z
  .object({
    id: z.string(),
    subject: subjectSchema,
    name: z.string(),
    date: z.string(),
    weight: z.number().int(),
    chapterKeys: z.array(z.string()),
    series: z.string().nullable().openapi({ description: 'Datesheet group, e.g. "Half-yearly"' }),
    kind: z.enum(EXAM_KINDS).nullable(),
  })
  .openapi('Exam');

const seriesSchema = trimmedText(1, 60);

const upcomingExamSchema = examSchema
  .extend({
    daysLeft: z.number().int(),
    readiness: z.object({ revised: z.number().int(), total: z.number().int() }),
    chapters: z.array(
      z.object({ key: z.string(), name: z.string(), status: z.enum(CHAPTER_STATUSES) }),
    ),
  })
  .openapi('UpcomingExam');

export function examRoutes(exams: ExamService): Route[] {
  const tags = ['Exams'];
  return [
    defineRoute({
      method: 'get',
      path: '/exams',
      access: 'user',
      summary: 'Upcoming tests with readiness',
      tags,
      response: upcomingExamSchema.array(),
      handler: ({ auth }) => exams.upcoming(auth.userId),
    }),
    defineRoute({
      method: 'post',
      path: '/exams',
      access: 'user',
      summary: 'Add a test',
      tags,
      status: 201,
      body: z
        .strictObject({
          subject: subjectSchema,
          name: trimmedText(1, 80),
          date: dateKeySchema,
          weight: z.number().int().min(1).max(100),
          chapterKeys: chapterKeysSchema,
          series: seriesSchema.nullable().optional(),
          kind: z.enum(EXAM_KINDS).nullable().optional(),
        })
        .openapi('NewExam'),
      response: examSchema,
      handler: ({ auth, body }) => exams.create(auth.userId, body),
    }),
    defineRoute({
      method: 'post',
      path: '/exams/datesheet',
      access: 'user',
      summary: 'Add a datesheet',
      description:
        'Adds every paper of one exam (e.g. the half-yearly) at once, grouped under `series`.',
      tags,
      status: 201,
      body: z
        .strictObject({
          series: seriesSchema,
          kind: z.enum(EXAM_KINDS),
          papers: z
            .array(
              z.strictObject({
                subject: subjectSchema,
                name: trimmedText(1, 80),
                date: dateKeySchema,
                weight: z.number().int().min(1).max(100).default(20),
                chapterKeys: chapterKeysSchema,
              }),
            )
            .min(1, 'Add at least one paper')
            .max(20),
        })
        .openapi('NewDatesheet'),
      response: examSchema.array(),
      handler: ({ auth, body }) => exams.createDatesheet(auth.userId, body),
    }),
    defineRoute({
      method: 'patch',
      path: '/exams/:id',
      access: 'user',
      summary: 'Edit a test',
      description:
        'Send only what changes. Changing the subject needs the chapters of the new subject. ' +
        'Study blocks already in the plan stay where they are.',
      tags,
      params: idParamsSchema,
      body: z
        .strictObject({
          subject: subjectSchema.optional(),
          name: trimmedText(1, 80).optional(),
          date: dateKeySchema.optional(),
          weight: z.number().int().min(1).max(100).optional(),
          chapterKeys: chapterKeysSchema.optional(),
          series: seriesSchema.nullable().optional(),
          kind: z.enum(EXAM_KINDS).nullable().optional(),
        })
        .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')
        .openapi('ExamPatch'),
      response: examSchema,
      handler: ({ auth, params, body }) => exams.update(auth.userId, params.id, body),
    }),
    defineRoute({
      method: 'delete',
      path: '/exams/:id',
      access: 'user',
      summary: 'Remove a test',
      tags,
      status: 204,
      params: idParamsSchema,
      handler: ({ auth, params }) => exams.remove(auth.userId, params.id),
    }),
  ];
}
