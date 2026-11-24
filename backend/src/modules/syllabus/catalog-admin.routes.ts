import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import {
  boardCodeSchema,
  hexColorSchema,
  objectIdSchema,
  subjectSchema as subjectIdSchema,
  trimmedText,
} from '../../common/utils/validators.js';
import type { AuditSink } from '../audit/audit.service.js';
import { BOARD_KINDS } from './catalog.model.js';
import type { CatalogService } from './catalog.service.js';
import { boardSchema } from './syllabus.routes.js';
import { MAX_CHAPTERS_PER_SUBJECT } from './syllabus.data.js';

const clsSchema = z.coerce.number().int().min(6).max(12);
const boardParams = z.object({ code: boardCodeSchema });
const classParams = z.object({ code: boardCodeSchema, cls: clsSchema });
const subjectParams = z.object({ id: objectIdSchema });

const chapterSchema = z.strictObject({
  name: trimmedText(1, 120),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});
const chaptersSchema = z.array(chapterSchema).max(MAX_CHAPTERS_PER_SUBJECT);

const adminBoardSchema = boardSchema
  .extend({
    classes: z.array(z.object({ cls: z.number().int(), subjects: z.number().int() })),
  })
  .openapi('AdminBoard');

const catalogSubjectSchema = z
  .object({
    id: z.string(),
    board: z.string(),
    cls: z.number().int(),
    subjectId: z.string(),
    name: z.string(),
    color: z.string(),
    position: z.number().int(),
    chapters: z.array(z.object({ name: z.string(), difficulty: z.number().int() })),
  })
  .openapi('CatalogSubject');

/** Admin portal: manage boards, and the subjects and chapters of each class. */
export function catalogAdminRoutes(catalog: CatalogService, audit: AuditSink): Route[] {
  const tags = ['Admin: syllabus'];
  const access = 'admin' as const;
  return [
    defineRoute({
      method: 'get',
      path: '/admin/syllabus/boards',
      access,
      summary: 'Boards with subject counts per class',
      tags,
      response: adminBoardSchema.array(),
      handler: () => catalog.overview(),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabus/boards',
      access,
      summary: 'Add a board (e.g. a state board)',
      tags,
      status: 201,
      body: z
        .strictObject({
          code: boardCodeSchema.optional(),
          name: trimmedText(1, 60),
          kind: z.enum(BOARD_KINDS),
        })
        .openapi('NewBoard'),
      response: boardSchema,
      handler: async ({ body, auth, meta }) => {
        const board = await catalog.createBoard(body);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'board.create',
          board: board.code,
        });
        return board;
      },
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/syllabus/boards/:code',
      access,
      summary: 'Rename a board, change its kind or its place in the list',
      tags,
      params: boardParams,
      body: z
        .strictObject({
          name: trimmedText(1, 60).optional(),
          kind: z.enum(BOARD_KINDS).optional(),
          position: z.number().int().min(0).max(999).optional(),
        })
        .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change'),
      response: boardSchema,
      handler: async ({ params, body, auth, meta }) => {
        const board = await catalog.updateBoard(params.code, body);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'board.update',
          board: params.code,
        });
        return board;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/syllabus/boards/:code',
      access,
      summary: 'Delete a board and all its subjects (students already set up keep their copy)',
      tags,
      status: 204,
      params: boardParams,
      handler: async ({ params, auth, meta }) => {
        await catalog.deleteBoard(params.code);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'board.delete',
          board: params.code,
        });
      },
    }),
    defineRoute({
      method: 'get',
      path: '/admin/syllabus/boards/:code/classes/:cls/subjects',
      access,
      summary: 'Subjects and chapters of one class',
      tags,
      params: classParams,
      response: catalogSubjectSchema.array(),
      handler: ({ params }) => catalog.adminSubjects(params.code, params.cls),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabus/boards/:code/classes/:cls/subjects',
      access,
      summary: 'Add a subject to a class',
      tags,
      status: 201,
      params: classParams,
      body: z
        .strictObject({
          subjectId: subjectIdSchema.optional(),
          name: trimmedText(1, 60),
          color: hexColorSchema.optional(),
          chapters: chaptersSchema.default([]),
        })
        .openapi('NewCatalogSubject'),
      response: catalogSubjectSchema,
      handler: async ({ params, body, auth, meta }) => {
        const subject = await catalog.createSubject(params.code, params.cls, body);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'subject.create',
          board: params.code,
          cls: params.cls,
          subject: subject.subjectId,
        });
        return subject;
      },
    }),
    defineRoute({
      method: 'put',
      path: '/admin/syllabus/boards/:code/classes/:cls/order',
      access,
      summary: 'Set the order subjects appear in',
      tags,
      params: classParams,
      body: z.strictObject({ subjectIds: z.array(subjectIdSchema).max(60) }),
      response: catalogSubjectSchema.array(),
      handler: ({ params, body }) => catalog.reorder(params.code, params.cls, body.subjectIds),
    }),
    defineRoute({
      method: 'post',
      path: '/admin/syllabus/boards/:code/classes/:cls/copy',
      access,
      summary: 'Copy the subjects of another board or class into this class',
      description: 'Subjects this class already has are left alone.',
      tags,
      params: classParams,
      body: z.strictObject({ fromBoard: boardCodeSchema, fromCls: clsSchema }),
      response: z.object({ added: z.number().int(), subjects: catalogSubjectSchema.array() }),
      handler: async ({ params, body, auth, meta }) => {
        const result = await catalog.copyClass(params.code, params.cls, {
          board: body.fromBoard,
          cls: body.fromCls,
        });
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'class.copy',
          board: params.code,
          cls: params.cls,
          from: `${body.fromBoard}/${body.fromCls}`,
        });
        return result;
      },
    }),
    defineRoute({
      method: 'patch',
      path: '/admin/syllabus/subjects/:id',
      access,
      summary: 'Rename a subject, change its colour or replace its chapter list',
      tags,
      params: subjectParams,
      body: z
        .strictObject({
          name: trimmedText(1, 60).optional(),
          color: hexColorSchema.optional(),
          chapters: chaptersSchema.optional(),
        })
        .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')
        .openapi('CatalogSubjectPatch'),
      response: catalogSubjectSchema,
      handler: async ({ params, body, auth, meta }) => {
        const subject = await catalog.updateSubject(params.id, body);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'subject.update',
          board: subject.board,
          cls: subject.cls,
          subject: subject.subjectId,
        });
        return subject;
      },
    }),
    defineRoute({
      method: 'delete',
      path: '/admin/syllabus/subjects/:id',
      access,
      summary: 'Delete a subject from a class',
      tags,
      status: 204,
      params: subjectParams,
      handler: async ({ params, auth, meta }) => {
        await catalog.deleteSubject(params.id);
        await audit.record('admin.syllabus_changed', auth.userId, meta, {
          op: 'subject.delete',
          id: params.id,
        });
      },
    }),
  ];
}
