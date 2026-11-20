import { NotFoundError } from '../../common/errors/app-error.js';
import { defineRoute, type Route } from '../../common/http/route.js';
import { z } from '../../common/zod.js';
import { ALL_CLASSES, catalogChapters, isSupportedClass, SUBJECT_IDS, SUBJECTS } from './syllabus.data.js';

const classSchema = z.object({ cls: z.number().int(), available: z.boolean() }).openapi('SyllabusClass');
const subjectSchema = z
  .object({
    id: z.enum(SUBJECT_IDS),
    name: z.string(),
    color: z.string(),
    chapters: z.array(z.object({ key: z.string(), name: z.string(), difficulty: z.number().int() })),
  })
  .openapi('SyllabusSubject');

export function syllabusRoutes(): Route[] {
  const tags = ['Syllabus'];
  return [
    defineRoute({
      method: 'get',
      path: '/syllabus/classes',
      access: 'user',
      summary: 'Classes and whether their NCERT syllabus is loaded',
      tags,
      response: classSchema.array(),
      handler: () => Promise.resolve(ALL_CLASSES.map((cls) => ({ cls, available: isSupportedClass(cls) }))),
    }),
    defineRoute({
      method: 'get',
      path: '/syllabus/:cls',
      access: 'user',
      summary: 'NCERT chapters for a class, grouped by subject',
      tags,
      params: z.object({ cls: z.coerce.number().int().min(6).max(12) }),
      response: subjectSchema.array(),
      handler: ({ params }) => {
        if (!isSupportedClass(params.cls)) throw new NotFoundError('That class is not available yet', 'CLASS_NOT_AVAILABLE');
        const chapters = catalogChapters(params.cls);
        return Promise.resolve(
          SUBJECT_IDS.map((id) => ({
            ...SUBJECTS[id],
            chapters: chapters
              .filter((chapter) => chapter.subject === id)
              .map(({ key, name, difficulty }) => ({ key, name, difficulty })),
          })),
        );
      },
    }),
  ];
}
