import { defineRoute, type Route } from '../../common/http/route.js';
import { hexColorSchema, objectIdSchema, trimmedText } from '../../common/utils/validators.js';
import { z } from '../../common/zod.js';
import type { AuditSink } from '../audit/audit.service.js';
import {
  academicYearSchema,
  codeSchema,
  copySourceSchema,
  importBodySchema,
  importResultSchema,
  subjectSchema,
  unitsInputSchema,
  versionDetailSchema,
  versionSchema,
} from './catalog.schemas.js';
import { LIMITS, NAME_MAX } from './catalog.types.js';
import { SUBJECT_ID_PATTERN } from './syllabus.data.js';
import type { SyllabusService } from './syllabus.service.js';

const idParams = z.object({ id: objectIdSchema });
const levelKey = z
  .string()
  .max(24)
  .regex(/^([a-z0-9][a-z0-9-]{0,23})?$/, 'Unknown level')
  .openapi({ description: "A level key, or '' when the exam has no levels" });

/** Admin portal: syllabus versions, their subjects and content, import and export. */
export function syllabusAdminRoutes(syllabi: SyllabusService, audit: AuditSink): Route[] {
  const tags = ['Admin: syllabus'];
  const access = 'user' as const;
  const record = (
    userId: string,
    meta: Parameters<AuditSink['record']>[2],
    details: Record<string, unknown>,
  ) => audit.record('admin.syllabus_changed', userId, meta, details);

  return [
    /* ---------- Versions ---------- */
    defineRoute({
      method: 'get',
      path: '/admin/exams/:code/syllabi',
      access,
      permission: 'catalog:read',
      summary: 'Syllabus versions of an exam, newest first',
      tags,
      params: z.object({ code: codeSchema }),
      response: versionSchema.array(),
      handler: ({ params }) => syllabi.versions(params.code),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/exams/:code/syllabi',
      access,
      permission: 'catalog:write',
      summary: 'Start a draft syllabus: empty, or copied from any version of any exam',
      tags,
      status: 201,
      params: z.object({ code: codeSchema }),
      body: z
        .strictObject({
          academicYear: academicYearSchema.optional(),
          title: z.string().trim().max(80).optional(),
          notes: z.string().trim().max(1000).optional(),
          copyFrom: copySourceSchema.optional(),
        })
        .openapi('NewSyllabusDraft'),
      response: z.object({
        version: versionSchema,
        copied: z.number().int(),
        skipped: z.number().int(),
      }),
      handler: async ({ params, body, auth, meta }) => {
        const result = await syllabi.createDraft(params.code, body, auth.userId);
        await record(auth.userId, meta, {
          op: 'syllabus.create',
          exam: params.code,
          syllabus: result.version.id,
          from: body.copyFrom?.syllabusId,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/syllabi/:id',
      access,
      permission: 'catalog:read',
      summary: 'A syllabus version with its exam and its subjects by level',
      tags,
      params: idParams,
      response: versionDetailSchema,
      handler: ({ params }) => syllabi.version(params.id),
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/syllabi/:id',
      access,
      permission: 'catalog:write',
      summary: 'Change a version’s title or notes, or a draft’s academic year',
      tags,
      params: idParams,
      body: z
        .strictObject({
          academicYear: academicYearSchema.optional(),
          title: z.string().trim().max(80).optional(),
          notes: z.string().trim().max(1000).optional(),
        })
        .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change'),
      response: versionSchema,
      handler: async ({ params, body, auth, meta }) => {
        const version = await syllabi.updateVersion(params.id, body);
        await record(auth.userId, meta, { op: 'syllabus.update', syllabus: params.id });
        return version;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/syllabi/:id',
      access,
      permission: 'catalog:publish',
      summary: 'Delete a draft or archived version',
      tags,
      status: 204,
      params: idParams,
      handler: async ({ params, auth, meta }) => {
        await syllabi.deleteVersion(params.id);
        await record(auth.userId, meta, { op: 'syllabus.delete', syllabus: params.id });
      },
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/publish',
      access,
      permission: 'catalog:publish',
      summary: 'Publish this version for new students (archives the one published before)',
      tags,
      params: idParams,
      response: z.object({ version: versionSchema, archived: z.string().nullable() }),
      handler: async ({ params, auth, meta }) => {
        const result = await syllabi.publish(params.id, auth.userId);
        await record(auth.userId, meta, {
          op: 'syllabus.publish',
          exam: result.version.exam,
          syllabus: params.id,
          archived: result.archived,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/unpublish',
      access,
      permission: 'catalog:publish',
      summary: 'Take a published version back to draft',
      description: 'Until another version is published, new students can’t pick this exam.',
      tags,
      params: idParams,
      response: versionSchema,
      handler: async ({ params, auth, meta }) => {
        const version = await syllabi.unpublish(params.id);
        await record(auth.userId, meta, {
          op: 'syllabus.unpublish',
          exam: version.exam,
          syllabus: params.id,
        });
        return version;
      },
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/duplicate',
      access,
      permission: 'catalog:write',
      summary: 'Copy this version into a new draft, of this exam or another one',
      tags,
      status: 201,
      params: idParams,
      body: z.strictObject({
        exam: codeSchema.optional(),
        academicYear: academicYearSchema.optional(),
        title: z.string().trim().max(80).optional(),
        level: levelKey.optional(),
        toLevel: levelKey.optional(),
      }),
      response: z.object({
        version: versionSchema,
        copied: z.number().int(),
        skipped: z.number().int(),
      }),
      handler: async ({ params, body, auth, meta }) => {
        const result = await syllabi.duplicate(params.id, body, auth.userId);
        await record(auth.userId, meta, {
          op: 'syllabus.duplicate',
          from: params.id,
          syllabus: result.version.id,
          exam: result.version.exam,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/syllabi/:id/export',
      access,
      permission: 'catalog:read',
      summary: 'Export as JSON (lossless) or CSV (one row per unit, chapter, topic or subtopic)',
      tags,
      params: idParams,
      query: z.object({
        format: z.enum(['json', 'csv']).default('json'),
        level: levelKey.optional(),
      }),
      response: z.object({ filename: z.string(), contentType: z.string(), content: z.string() }),
      handler: ({ params, query }) =>
        syllabi.exportContent(params.id, query.format, query.level || undefined),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/import',
      access,
      permission: 'catalog:write',
      summary: 'Import a JSON export or CSV sheet into a draft (dry run by default)',
      tags,
      params: idParams,
      body: importBodySchema,
      response: importResultSchema,
      handler: async ({ params, body, auth, meta }) => {
        const result = await syllabi.importContent(params.id, body);
        if (result.applied)
          await record(auth.userId, meta, {
            op: 'syllabus.import',
            syllabus: params.id,
            mode: body.mode,
            format: body.format,
            subjects: result.subjects,
          });
        return result;
      },
    }),

    /* ---------- Subjects ---------- */
    defineRoute({
      method: 'get',
      path: '/admin/syllabi/:id/subjects',
      access,
      permission: 'catalog:read',
      summary: 'Subjects of a version with their whole trees (optionally one level)',
      tags,
      params: idParams,
      query: z.object({ level: levelKey.optional() }),
      response: subjectSchema.array(),
      handler: ({ params, query }) => syllabi.subjects(params.id, query.level),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/subjects',
      access,
      permission: 'catalog:write',
      summary: 'Add a subject to a level of a draft',
      tags,
      status: 201,
      params: idParams,
      body: z
        .strictObject({
          level: levelKey.optional(),
          name: trimmedText(1, NAME_MAX.subject),
          subjectId: z
            .string()
            .regex(SUBJECT_ID_PATTERN, 'Use 2–24 lowercase letters and numbers')
            .optional(),
          color: hexColorSchema.optional(),
        })
        .openapi('NewSyllabusSubject'),
      response: subjectSchema,
      handler: async ({ params, body, auth, meta }) => {
        const subject = await syllabi.createSubject(params.id, body);
        await record(auth.userId, meta, {
          op: 'subject.create',
          syllabus: params.id,
          level: subject.level,
          subject: subject.subjectId,
        });
        return subject;
      },
    }),
    defineRoute({
      method: 'put',
      path: '/admin/syllabi/:id/subjects/order',
      access,
      permission: 'catalog:write',
      summary: 'Set the order of a level’s subjects',
      tags,
      params: idParams,
      body: z.strictObject({
        level: levelKey.default(''),
        subjectIds: z.array(z.string().regex(SUBJECT_ID_PATTERN)).max(LIMITS.subjectsPerLevel),
      }),
      response: subjectSchema.array(),
      handler: ({ params, body }) =>
        syllabi.reorderSubjects(params.id, body.level, body.subjectIds),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabi/:id/levels/:level/copy',
      access,
      permission: 'catalog:write',
      summary: 'Copy the subjects of a level of another version into this level',
      description:
        'Subjects this level already has are left alone. Use `-` as the level for exams without levels.',
      tags,
      params: z.object({ id: objectIdSchema, level: z.string().max(24) }),
      body: z.strictObject({ fromSyllabusId: objectIdSchema, fromLevel: levelKey.default('') }),
      response: z.object({ added: z.number().int(), subjects: subjectSchema.array() }),
      handler: async ({ params, body, auth, meta }) => {
        const level = params.level === '-' ? '' : params.level;
        const result = await syllabi.copyLevel(params.id, level, {
          syllabusId: body.fromSyllabusId,
          level: body.fromLevel,
        });
        await record(auth.userId, meta, {
          op: 'level.copy',
          syllabus: params.id,
          level,
          from: `${body.fromSyllabusId}/${body.fromLevel}`,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/syllabus-subjects/:id',
      access,
      permission: 'catalog:read',
      summary: 'One subject with its whole tree',
      tags,
      params: idParams,
      response: subjectSchema,
      handler: ({ params }) => syllabi.subject(params.id),
    }),
    defineRoute({
      method: 'put',
      path: '/admin/syllabus-subjects/:id',
      access,
      permission: 'catalog:write',
      summary: 'Save a subject: name, colour and its units, chapters, topics and subtopics',
      description:
        'Send the `revision` you loaded. If someone saved in between, the answer is 409 SUBJECT_CHANGED and nothing is written.',
      tags,
      params: idParams,
      body: z
        .strictObject({
          revision: z.number().int().min(1),
          name: trimmedText(1, NAME_MAX.subject).optional(),
          color: hexColorSchema.optional(),
          units: unitsInputSchema,
        })
        .openapi('SyllabusSubjectSave'),
      response: subjectSchema,
      handler: async ({ params, body, auth, meta }) => {
        const subject = await syllabi.saveSubject(params.id, body);
        await record(auth.userId, meta, {
          op: 'subject.update',
          syllabus: subject.syllabus,
          subject: subject.subjectId,
        });
        return subject;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/syllabus-subjects/:id',
      access,
      permission: 'catalog:write',
      summary: 'Delete a subject from a draft',
      tags,
      status: 204,
      params: idParams,
      handler: async ({ params, auth, meta }) => {
        await syllabi.deleteSubject(params.id);
        await record(auth.userId, meta, { op: 'subject.delete', id: params.id });
      },
    }),
  ];
}
