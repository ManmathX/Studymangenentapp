import type { NextFunction, Request, Response } from 'express';
import { paginationQuerySchema } from '../../common/http/page.js';
import { errorResponseSchema } from '../../common/http/responses.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { boardCodeSchema } from '../../common/utils/validators.js';
import { z } from '../../common/zod.js';
import { categorySchema, codeSchema, keySchema } from './catalog.schemas.js';
import type { CatalogService } from './catalog.service.js';
import { CATEGORY_GROUPS, REGIONS } from './catalog.types.js';

export const boardSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    kind: z.enum(['national', 'state']),
    position: z.number().int(),
  })
  .openapi('Board');
const classSchema = z
  .object({ cls: z.number().int(), available: z.boolean() })
  .openapi('SyllabusClass');
const legacySubjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    chapters: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        difficulty: z.number().int(),
        book: z.string().optional(),
      }),
    ),
  })
  .openapi('SyllabusSubjectLegacy');

const levelSchema = z.object({
  key: z.string(),
  name: z.string(),
  grade: z.number().int().optional(),
});

const studentExamSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    shortName: z.string(),
    category: z.string(),
    categoryName: z.string(),
    categoryGroup: z.enum(CATEGORY_GROUPS),
    description: z.string(),
    conductingBody: z.string(),
    color: z.string(),
    logoUrl: z.string().nullable().openapi({ description: 'Path on the API origin, or null' }),
    region: z.enum(REGIONS),
    state: z.string(),
    levelLabel: z.string(),
    unitLabel: z.string(),
    levels: z.array(levelSchema.extend({ available: z.boolean() })),
    available: z.boolean(),
    academicYear: z.string().nullable(),
    languages: z.array(z.string()),
    position: z.number().int(),
  })
  .openapi('Exam');

const studentExamDetailSchema = studentExamSchema
  .extend({
    eligibility: z.string(),
    targetGrades: z.array(z.number().int()),
    version: z
      .object({
        id: z.string(),
        academicYear: z.string(),
        version: z.number().int(),
        publishedAt: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi('ExamDetail');

const topicSchema = z.object({
  name: z.string(),
  important: z.boolean(),
  weightage: z.number().optional(),
  marks: z.number().optional(),
  priority: z.string().optional(),
  subtopics: z.array(z.object({ name: z.string(), important: z.boolean() })),
});

const studentSyllabusSchema = z
  .object({
    exam: z.object({
      code: z.string(),
      name: z.string(),
      shortName: z.string(),
      category: z.string(),
      color: z.string(),
      logoUrl: z.string().nullable(),
    }),
    level: levelSchema.nullable(),
    labels: z.object({ level: z.string(), unit: z.string() }),
    version: z.object({
      id: z.string(),
      academicYear: z.string(),
      version: z.number().int(),
      publishedAt: z.string().nullable(),
    }),
    subjects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        units: z.array(z.object({ name: z.string(), chapters: z.number().int() })),
        chapters: z.array(
          z.object({
            key: z.string().openapi({ description: '`<subject>-<n>`, 1-based in syllabus order' }),
            name: z.string(),
            difficulty: z.number().int(),
            book: z.string().optional(),
            unit: z.string().optional(),
            important: z.boolean(),
            weightage: z.number().optional(),
            marks: z.number().optional(),
            priority: z.string().optional(),
            grade: z.number().int().optional(),
            topics: z.array(topicSchema),
          }),
        ),
      }),
    ),
  })
  .openapi('ExamSyllabus');

const boardQuery = z.object({ board: boardCodeSchema.default('cbse') });
const examParams = z.object({ code: codeSchema });

/**
 * What the app reads at setup. The exam picker uses `/syllabus/categories` and
 * `/syllabus/exams…`; app builds from before exams use `/syllabus/boards`, `/syllabus/classes`
 * and `/syllabus/:cls`, which keep their shapes and only list school boards.
 */
export function syllabusRoutes(catalog: CatalogService): Route[] {
  const tags = ['Syllabus'];
  return [
    defineRoute({
      method: 'get',
      path: '/syllabus/categories',
      access: 'user',
      summary: 'Exam categories to browse by, with how many exams each has',
      tags,
      response: categorySchema.array(),
      handler: () => catalog.categories(),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/exams',
      access: 'user',
      summary: 'Boards and exams a student can pick, in display order',
      description:
        'Active exams in active categories that have a published syllabus with chapters, with only the levels ' +
        'that are ready. Exams still being prepared are left out. `q` matches name, short name, code, description and state.',
      tags,
      query: paginationQuerySchema.extend({
        limit: z.coerce.number().int().min(1).max(200).default(100),
        category: codeSchema.optional(),
        q: z.string().trim().max(60).optional(),
      }),
      response: studentExamSchema,
      paginated: true,
      handler: ({ query }) => catalog.list(query),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/exams/:code',
      access: 'user',
      summary: 'One exam: eligibility, levels and its published syllabus version',
      tags,
      params: examParams,
      response: studentExamDetailSchema,
      handler: ({ params }) => catalog.exam(params.code),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/exams/:code/subjects',
      access: 'user',
      summary: 'The published syllabus: subjects, chapters (with units) and topics',
      description:
        'Pass `level` (e.g. `10` or `prelims`) when the exam has levels. The app keeps its own copy, ' +
        'so later edits only affect students who set up afterwards.',
      tags,
      params: examParams,
      query: z.object({ level: keySchema.optional() }),
      response: studentSyllabusSchema,
      handler: ({ params, query }) => catalog.syllabus(params.code, query.level),
    }),
    logoRoute(catalog),
    defineRoute({
      method: 'get',
      path: '/syllabus/boards',
      access: 'user',
      summary: 'School boards (for app versions from before exams)',
      tags,
      response: boardSchema.array(),
      handler: () => catalog.boards(),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/classes',
      access: 'user',
      summary:
        'Classes 6–12 of a board and whether each has a syllabus (for app versions from before exams)',
      tags,
      query: boardQuery,
      response: classSchema.array(),
      handler: ({ query }) => catalog.classes(query.board),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/:cls',
      access: 'user',
      summary: 'Chapters for a class on a board, by subject (for app versions from before exams)',
      tags,
      params: z.object({ cls: z.coerce.number().int().min(6).max(12) }),
      query: boardQuery,
      response: legacySubjectSchema.array(),
      handler: ({ params, query }) => catalog.subjectsFor(query.board, params.cls),
    }),
  ];
}

/**
 * The exam's logo image. Public (images load without a token) and cached for a year: the URL
 * carries a hash of the image, so a new logo gets a new URL.
 */
function logoRoute(catalog: CatalogService): Route {
  const path = '/syllabus/exams/:code/logo';
  return {
    method: 'get',
    path,
    mount(router) {
      router.get(path, (req: Request, res: Response, next: NextFunction) => {
        const code = codeSchema.safeParse(req.params.code);
        if (!code.success) {
          res.status(404).json({
            success: false,
            error: {
              code: 'LOGO_NOT_FOUND',
              message: 'This exam has no logo',
              requestId: res.locals.requestId,
            },
          });
          return;
        }
        catalog
          .logo(code.data)
          .then((logo) => {
            res.set({
              'Content-Type': logo.contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              // helmet sends same-origin; the admin portal and the web app live on other origins.
              'Cross-Origin-Resource-Policy': 'cross-origin',
              'Content-Security-Policy': "default-src 'none'",
              'X-Content-Type-Options': 'nosniff',
            });
            res.send(logo.data);
          })
          .catch(next);
      });
    },
    document(registry, prefix) {
      registry.registerPath({
        method: 'get',
        path: `${prefix}/syllabus/exams/{code}/logo`,
        summary: "An exam's logo (PNG, JPEG or WebP)",
        tags: ['Syllabus'],
        security: [],
        request: { params: examParams },
        responses: {
          200: {
            description: 'The image',
            content: { 'image/*': { schema: z.string().openapi({ format: 'binary' }) } },
          },
          404: {
            description: 'No logo',
            content: { 'application/json': { schema: errorResponseSchema } },
          },
        },
      });
    },
  };
}
