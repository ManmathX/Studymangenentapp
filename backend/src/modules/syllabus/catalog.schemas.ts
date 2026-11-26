/** Zod schemas for the exam catalogue API: request validation and OpenAPI documentation. */
import { hexColorSchema, trimmedText } from '../../common/utils/validators.js';
import { z } from '../../common/zod.js';
import {
  CATEGORY_GROUPS,
  CODE_PATTERN,
  isValidAcademicYear,
  KEY_PATTERN,
  LIMITS,
  NAME_MAX,
  PRIORITIES,
  REGIONS,
  SETTING_KEY_PATTERN,
  VERSION_STATUSES,
} from './catalog.types.js';

export const codeSchema = z
  .string()
  .regex(CODE_PATTERN, 'Use 2–32 lowercase letters, numbers and dashes, starting with a letter')
  .openapi({ example: 'jee-main' });

export const keySchema = z
  .string()
  .regex(KEY_PATTERN, 'Use up to 24 lowercase letters, numbers and dashes')
  .openapi({ example: 'prelims' });

export const academicYearSchema = z
  .string()
  .refine(isValidAcademicYear, 'Use an academic year like 2026-27 or 2027')
  .openapi({ example: '2026-27' });

const longText = (max: number) => z.string().trim().max(max);
const amount = (max: number) => z.number().min(0).max(max).nullish();
const grade = z.number().int().min(1).max(12);
const important = z.boolean().nullish();
const priority = z.enum(PRIORITIES).nullish();

/* ---------- Categories ---------- */

export const categorySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    description: z.string(),
    group: z.enum(CATEGORY_GROUPS),
    position: z.number().int(),
    isActive: z.boolean(),
    exams: z.number().int().optional(),
  })
  .openapi('ExamCategory');

export const newCategorySchema = z
  .strictObject({
    code: codeSchema.optional(),
    name: trimmedText(1, NAME_MAX.category),
    description: longText(300).optional(),
    group: z.enum(CATEGORY_GROUPS),
    isActive: z.boolean().optional(),
  })
  .openapi('NewExamCategory');

export const categoryPatchSchema = z
  .strictObject({
    name: trimmedText(1, NAME_MAX.category).optional(),
    description: longText(300).optional(),
    group: z.enum(CATEGORY_GROUPS).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')
  .openapi('ExamCategoryPatch');

/* ---------- Exams ---------- */

const levelSchema = z.strictObject({
  key: keySchema,
  name: trimmedText(1, NAME_MAX.level),
  grade: grade.nullish(),
});

export const structureSchema = z
  .strictObject({
    levelLabel: trimmedText(1, 24).optional(),
    levels: z.array(levelSchema).max(LIMITS.levels).optional(),
    useUnits: z.boolean().optional(),
    unitLabel: trimmedText(1, 24).optional(),
    useTopics: z.boolean().optional(),
    useSubtopics: z.boolean().optional(),
  })
  .superRefine((structure, ctx) => {
    const levels = structure.levels ?? [];
    const keys = new Set<string>();
    const grades = new Set<number>();
    levels.forEach((level, index) => {
      if (keys.has(level.key))
        ctx.addIssue({
          code: 'custom',
          path: ['levels', index, 'key'],
          message: 'Each level needs its own key',
        });
      keys.add(level.key);
      if (level.grade) {
        if (grades.has(level.grade))
          ctx.addIssue({
            code: 'custom',
            path: ['levels', index, 'grade'],
            message: 'Two levels have the same class',
          });
        grades.add(level.grade);
      }
    });
  })
  .openapi('ExamStructure');

const settingsSchema = z
  .record(
    z
      .string()
      .regex(
        SETTING_KEY_PATTERN,
        'Setting names use letters, numbers, dots, dashes and underscores',
      ),
    z.union([z.string().max(300), z.number(), z.boolean()]),
  )
  .refine(
    (settings) => Object.keys(settings).length <= LIMITS.settings,
    `At most ${LIMITS.settings} settings`,
  )
  .openapi({ description: 'Exam-specific configuration as key/value pairs' });

const examFields = {
  name: trimmedText(1, NAME_MAX.exam),
  shortName: trimmedText(1, NAME_MAX.shortName).optional(),
  category: codeSchema,
  description: longText(1000).optional(),
  color: hexColorSchema.optional(),
  conductingBody: longText(120).optional(),
  region: z.enum(REGIONS).optional(),
  state: longText(60).optional(),
  eligibility: longText(1000).optional(),
  targetGrades: z.array(grade).max(LIMITS.targetGrades).optional(),
  structure: structureSchema.optional(),
  languages: z.array(trimmedText(1, 40)).max(LIMITS.languages).optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).max(9999).optional(),
  settings: settingsSchema.optional(),
};

export const newExamSchema = z
  .strictObject({
    code: codeSchema.optional(),
    ...examFields,
    subjects: z
      .array(
        z.strictObject({
          name: trimmedText(1, NAME_MAX.subject),
          color: hexColorSchema.optional(),
        }),
      )
      .max(LIMITS.subjectsPerLevel)
      .optional()
      .openapi({ description: 'Subjects of the first draft syllabus, added at every level' }),
    academicYear: academicYearSchema.optional(),
  })
  .openapi('NewExam');

export const examPatchSchema = z
  .strictObject({
    ...examFields,
    name: examFields.name.optional(),
    category: codeSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')
  .openapi('ExamPatch');

const versionBriefSchema = z.object({
  id: z.string(),
  academicYear: z.string(),
  version: z.number().int(),
  status: z.enum(VERSION_STATUSES),
  counts: z.record(z.string(), z.number()),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const examSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    shortName: z.string(),
    category: z.string(),
    categoryName: z.string(),
    description: z.string(),
    color: z.string(),
    logoUrl: z.string().nullable(),
    conductingBody: z.string(),
    region: z.enum(REGIONS),
    state: z.string(),
    eligibility: z.string(),
    targetGrades: z.array(z.number().int()),
    structure: z.object({
      levelLabel: z.string(),
      levels: z.array(
        z.object({ key: z.string(), name: z.string(), grade: z.number().int().optional() }),
      ),
      useUnits: z.boolean(),
      unitLabel: z.string(),
      useTopics: z.boolean(),
      useSubtopics: z.boolean(),
    }),
    languages: z.array(z.string()),
    isActive: z.boolean(),
    position: z.number().int(),
    settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    syllabus: z.object({
      published: versionBriefSchema.nullable(),
      drafts: z.number().int(),
      latestDraft: versionBriefSchema.nullable(),
      years: z.array(z.string()),
    }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('AdminExam');

/* ---------- Syllabus trees ---------- */

export const subtopicInputSchema = z.strictObject({
  name: trimmedText(1, NAME_MAX.subtopic),
  important,
});

export const topicInputSchema = z.strictObject({
  name: trimmedText(1, NAME_MAX.topic),
  important,
  weightage: amount(100),
  marks: amount(1000),
  priority,
  subtopics: z.array(subtopicInputSchema).max(LIMITS.subtopicsPerTopic).nullish(),
});

export const chapterInputSchema = z.strictObject({
  name: trimmedText(1, NAME_MAX.chapter),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish(),
  book: longText(NAME_MAX.book).nullish(),
  important,
  weightage: amount(100),
  marks: amount(1000),
  priority,
  grade: grade.nullish(),
  topics: z.array(topicInputSchema).max(LIMITS.topicsPerChapter).nullish(),
});

export const unitInputSchema = z
  .strictObject({
    name: longText(NAME_MAX.unit).nullish(),
    weightage: amount(100),
    marks: amount(1000),
    chapters: z.array(chapterInputSchema).max(LIMITS.chaptersPerSubject).nullish(),
  })
  .openapi('SyllabusUnit', {
    description:
      'A unit with its chapters, topics and subtopics. Name is empty for chapters outside units.',
  });

export const unitsInputSchema = z.array(unitInputSchema).max(LIMITS.unitsPerSubject);

/** One subject in an import file (the JSON export has the same shape). */
export const importSubjectSchema = z.strictObject({
  level: z.string().max(40).nullish(),
  subjectId: z.string().nullish(),
  name: trimmedText(1, NAME_MAX.subject),
  color: hexColorSchema.nullish(),
  units: unitsInputSchema.default([]),
});

export const importFileSchema = z.object({
  subjects: z.array(importSubjectSchema).max(LIMITS.subjectsPerLevel * LIMITS.levels),
});

export const subjectSchema = z
  .object({
    id: z.string(),
    syllabus: z.string(),
    exam: z.string(),
    level: z.string(),
    subjectId: z.string(),
    name: z.string(),
    color: z.string(),
    position: z.number().int(),
    revision: z.number().int(),
    counts: z.record(z.string(), z.number()),
    units: z.array(unitInputSchema),
    updatedAt: z.string(),
  })
  .openapi('SyllabusSubject');

export const subjectSummarySchema = z.object({
  id: z.string(),
  level: z.string(),
  subjectId: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number().int(),
  revision: z.number().int(),
  counts: z.record(z.string(), z.number()),
});

export const versionSchema = z
  .object({
    id: z.string(),
    exam: z.string(),
    academicYear: z.string(),
    version: z.number().int(),
    status: z.enum(VERSION_STATUSES),
    title: z.string(),
    notes: z.string(),
    counts: z.record(z.string(), z.number()),
    publishedAt: z.string().nullable(),
    publishedBy: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('SyllabusVersion');

export const versionDetailSchema = versionSchema
  .extend({
    editable: z.boolean(),
    examInfo: examSchema.omit({ syllabus: true, categoryName: true }),
    levels: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        grade: z.number().int().optional(),
        subjects: z.array(subjectSummarySchema),
      }),
    ),
  })
  .openapi('SyllabusVersionDetail');

export const copySourceSchema = z.strictObject({
  syllabusId: z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a valid id'),
  level: z
    .string()
    .max(24)
    .optional()
    .openapi({ description: 'Copy only this level of the source' }),
  toLevel: z
    .string()
    .max(24)
    .optional()
    .openapi({ description: 'Level of this exam to copy it into' }),
});

export const importBodySchema = z
  .strictObject({
    format: z.enum(['json', 'csv']),
    content: z.string().min(1).max(1_800_000),
    mode: z.enum(['merge', 'replace']).default('merge'),
    dryRun: z.boolean().default(true),
  })
  .openapi('SyllabusImport', {
    description:
      'merge: add and update by name, never remove. replace: replace every subject at the levels the file mentions. Send dryRun first to preview.',
  });

export const importResultSchema = z
  .object({
    applied: z.boolean(),
    problems: z.array(
      z.object({
        row: z.number().int().optional(),
        path: z.string().optional(),
        message: z.string(),
      }),
    ),
    levels: z.array(z.string()),
    subjects: z.object({
      added: z.number().int(),
      updated: z.number().int(),
      removed: z.number().int(),
    }),
    added: z.record(z.string(), z.number()),
    updated: z.record(z.string(), z.number()),
  })
  .openapi('SyllabusImportResult');
