import { paginationQuerySchema } from '../../common/http/page.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import type { AuditSink } from '../audit/audit.service.js';
import {
  academicYearSchema,
  categoryPatchSchema,
  categorySchema,
  codeSchema,
  examPatchSchema,
  examSchema,
  newCategorySchema,
  newExamSchema,
} from './catalog.schemas.js';
import { LIMITS } from './catalog.types.js';
import type { DashboardService } from './dashboard.service.js';
import type { ExamService } from './exam.service.js';
import type { SyllabusService } from './syllabus.service.js';

const examParams = z.object({ code: codeSchema });
const filters = {
  category: codeSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  year: academicYearSchema.optional(),
};

const dashboardSchema = z
  .object({
    totals: z.object({
      boards: z.number().int(),
      competitive: z.number().int(),
      exams: z.number().int(),
      active: z.number().int(),
      inactive: z.number().int(),
      draftSyllabi: z.number().int(),
      publishedSyllabi: z.number().int(),
    }),
    content: z.record(z.string(), z.number()),
    byCategory: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        group: z.string(),
        exams: z.number().int(),
        active: z.number().int(),
        published: z.number().int(),
      }),
    ),
    years: z.array(z.string()),
    recentDrafts: z.array(z.looseObject({ id: z.string(), exam: z.string() })),
  })
  .openapi('AdminDashboard');

/** Admin portal: dashboard, exam categories and exams. */
export function examAdminRoutes(
  exams: ExamService,
  syllabi: SyllabusService,
  dashboard: DashboardService,
  audit: AuditSink,
): Route[] {
  const tags = ['Admin: exams'];
  const access = 'user' as const;
  return [
    defineRoute({
      method: 'get',
      path: '/admin/dashboard',
      access,
      permission: 'catalog:read',
      summary: 'Totals of exams and syllabi, by category',
      description:
        '`status` filters exams by active/inactive; `year` keeps exams with a syllabus for that academic year. ' +
        'Content totals count published syllabi.',
      tags,
      query: z.object(filters),
      response: dashboardSchema,
      handler: ({ query }) => dashboard.overview(query),
    }),

    /* ---------- Categories ---------- */
    defineRoute({
      method: 'get',
      path: '/admin/exam-categories',
      access,
      permission: 'catalog:read',
      summary: 'Exam categories in display order, with exam counts',
      tags,
      response: categorySchema.array(),
      handler: () => exams.categories(),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/exam-categories',
      access,
      permission: 'catalog:write',
      summary: 'Add an exam category',
      tags,
      status: 201,
      body: newCategorySchema,
      response: categorySchema,
      handler: async ({ body, auth, meta }) => {
        const category = await exams.createCategory(body);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'category.create',
          category: category.code,
        });
        return category;
      },
    }),
    defineRoute({
      method: 'put',
      path: '/admin/exam-categories/order',
      access,
      permission: 'catalog:write',
      summary: 'Set the order categories appear in',
      tags,
      body: z.strictObject({ codes: z.array(codeSchema).max(LIMITS.categories) }),
      response: categorySchema.array(),
      handler: ({ body }) => exams.reorderCategories(body.codes),
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/exam-categories/:code',
      access,
      permission: 'catalog:write',
      summary: 'Rename a category, change its group, or hide it',
      tags,
      params: examParams,
      body: categoryPatchSchema,
      response: categorySchema,
      handler: async ({ params, body, auth, meta }) => {
        const category = await exams.updateCategory(params.code, body);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'category.update',
          category: params.code,
        });
        return category;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/exam-categories/:code',
      access,
      permission: 'catalog:publish',
      summary: 'Delete an empty category',
      tags,
      status: 204,
      params: examParams,
      handler: async ({ params, auth, meta }) => {
        await exams.deleteCategory(params.code);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'category.delete',
          category: params.code,
        });
      },
    }),

    /* ---------- Exams ---------- */
    defineRoute({
      method: 'get',
      path: '/admin/exams',
      access,
      permission: 'catalog:read',
      summary: 'Exams with their syllabus status, filtered and paged',
      tags,
      query: paginationQuerySchema.extend({
        ...filters,
        q: z.string().trim().max(60).optional(),
        sort: z.enum(['position', 'name', '-updatedAt']).default('position'),
      }),
      response: examSchema,
      paginated: true,
      handler: ({ query }) => exams.list(query),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/exams',
      access,
      permission: 'catalog:write',
      summary: 'Add a board or exam, with a first draft syllabus',
      description:
        'The exam is visible to students once it is active and a syllabus with chapters is published. ' +
        'The code is permanent: students’ phones store it.',
      tags,
      status: 201,
      body: newExamSchema,
      response: z.object({ exam: examSchema, draftId: z.string() }),
      handler: async ({ body, auth, meta }) => {
        const created = await exams.create(body, auth.userId);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'exam.create',
          exam: created.exam.code,
        });
        return created;
      },
    }),
    defineRoute({
      method: 'put',
      path: '/admin/exams/order',
      access,
      permission: 'catalog:write',
      summary: 'Set the display order of exams (usually one category’s)',
      tags,
      body: z.strictObject({ codes: z.array(codeSchema).max(500) }),
      handler: async ({ body }) => {
        await exams.reorder(body.codes);
        return null;
      },
    }),
    defineRoute({
      method: 'post',
      path: '/admin/exams/standard',
      access,
      permission: 'catalog:write',
      summary: 'Load the standard CBSE and ICSE syllabus (classes 6–12) into drafts',
      description:
        'Adds missing standard subjects, fills in book names and appends missing chapters in a draft of each board ' +
        '(made from the published version if there is no draft). Admin edits are kept. Publish the drafts to apply them.',
      tags,
      response: z.object({
        added: z.number().int(),
        updated: z.number().int(),
        drafts: z.array(z.object({ exam: z.string(), syllabusId: z.string() })),
      }),
      handler: async ({ auth, meta }) => {
        const result = await syllabi.loadStandard(auth.userId);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'standard.import',
          added: result.added,
          updated: result.updated,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/exams/:code',
      access,
      permission: 'catalog:read',
      summary: 'One exam with its syllabus status',
      tags,
      params: examParams,
      response: examSchema,
      handler: ({ params }) => exams.get(params.code),
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/exams/:code',
      access,
      permission: 'catalog:write',
      summary: 'Change an exam’s details, structure or status',
      description: 'Levels that a draft or the published syllabus still uses cannot be removed.',
      tags,
      params: examParams,
      body: examPatchSchema,
      response: examSchema,
      handler: async ({ params, body, auth, meta }) => {
        const exam = await exams.update(params.code, body);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'exam.update',
          exam: params.code,
          fields: Object.keys(body),
        });
        return exam;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/exams/:code',
      access,
      permission: 'catalog:publish',
      summary: 'Delete an exam with all its syllabus versions',
      description: 'Students already set up keep their copy on their phone.',
      tags,
      status: 204,
      params: examParams,
      handler: async ({ params, auth, meta }) => {
        await exams.remove(params.code);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'exam.delete',
          exam: params.code,
        });
      },
    }),
    defineRoute({
      method: 'put',
      path: '/admin/exams/:code/logo',
      access,
      permission: 'catalog:write',
      summary: 'Upload the exam’s logo (PNG, JPEG or WebP, at most 200 kB)',
      tags,
      params: examParams,
      body: z
        .strictObject({
          dataBase64: z
            .string()
            .min(8)
            // Generous here so the service can answer "at most 200 kB" for a slightly big image.
            .max(LIMITS.logoBytes * 2)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Send the image as base64'),
        })
        .openapi('ExamLogoUpload'),
      response: examSchema,
      handler: async ({ params, body, auth, meta }) => {
        const exam = await exams.setLogo(params.code, body.dataBase64);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'exam.logo',
          exam: params.code,
        });
        return exam;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/exams/:code/logo',
      access,
      permission: 'catalog:write',
      summary: 'Remove the exam’s logo',
      tags,
      params: examParams,
      response: examSchema,
      handler: async ({ params, auth, meta }) => {
        const exam = await exams.removeLogo(params.code);
        await audit.record('admin.exam_changed', auth.userId, meta, {
          op: 'exam.logo_removed',
          exam: params.code,
        });
        return exam;
      },
    }),
  ];
}
