import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { boardCodeSchema } from '../../common/utils/validators.js';
import { BOARD_KINDS } from './catalog.model.js';
import type { CatalogService } from './catalog.service.js';

export const boardSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    kind: z.enum(BOARD_KINDS),
    position: z.number().int(),
  })
  .openapi('Board');
const classSchema = z
  .object({ cls: z.number().int(), available: z.boolean() })
  .openapi('SyllabusClass');
const subjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    chapters: z.array(
      z.object({ key: z.string(), name: z.string(), difficulty: z.number().int() }),
    ),
  })
  .openapi('SyllabusSubject');

const boardQuery = z.object({ board: boardCodeSchema.default('cbse') });

export function syllabusRoutes(catalog: CatalogService): Route[] {
  const tags = ['Syllabus'];
  return [
    defineRoute({
      method: 'get',
      path: '/syllabus/boards',
      access: 'user',
      summary: 'Boards a student can pick: CBSE, ICSE and state boards',
      tags,
      response: boardSchema.array(),
      handler: () => catalog.boards(),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/classes',
      access: 'user',
      summary: 'Classes and whether their syllabus is loaded for a board',
      tags,
      query: boardQuery,
      response: classSchema.array(),
      handler: ({ query }) => catalog.classes(query.board),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/:cls',
      access: 'user',
      summary: 'Chapters for a class on a board, grouped by subject',
      tags,
      params: z.object({ cls: z.coerce.number().int().min(6).max(12) }),
      query: boardQuery,
      response: subjectSchema.array(),
      handler: ({ params, query }) => catalog.subjectsFor(query.board, params.cls),
    }),
  ];
}
