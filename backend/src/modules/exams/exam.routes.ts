import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import {
  dateKeySchema,
  idParamsSchema,
  subjectSchema,
  trimmedText,
} from '../../common/utils/validators.js';
import { CHAPTER_STATUSES } from '../planner/planner.types.js';
import type { ExamService } from './exam.service.js';

const examSchema = z
  .object({
    id: z.string(),
    subject: subjectSchema,
    name: z.string(),
    date: z.string(),
    weight: z.number().int(),
    chapterKeys: z.array(z.string()),
  })
  .openapi('Exam');

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
          chapterKeys: z
            .array(z.string().regex(/^[a-z]+-\d{1,2}$/))
            .min(1, 'Tick at least one chapter so the planner knows what to revise')
            .max(40),
        })
        .openapi('NewExam'),
      response: examSchema,
      handler: ({ auth, body }) => exams.create(auth.userId, body),
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
