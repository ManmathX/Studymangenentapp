import { z } from '../../common/zod.js';
import { dateKeySchema, subjectSchema, trimmedText } from '../../common/utils/validators.js';
import { isValidTimeZone } from '../../common/utils/dates.js';
import { SUBJECT_IDS } from '../syllabus/syllabus.data.js';
import { AGE_MODES } from '../planner/planner.types.js';

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
  .openapi({ example: '07:45' });
const timezone = z
  .string()
  .max(64)
  .refine(isValidTimeZone, 'Unknown time zone')
  .openapi({ example: 'Asia/Kolkata' });
const chapterKey = z.string().regex(/^[a-z]+-\d{1,2}$/, 'Invalid chapter key');

export const onboardingExamSchema = z.strictObject({
  subject: subjectSchema,
  name: trimmedText(1, 80),
  date: dateKeySchema,
  weight: z.number().int().min(1).max(100).default(20),
  chapterKeys: z.array(chapterKey).min(1).max(40),
});

export const onboardingBodySchema = z
  .strictObject({
    cls: z.number().int().min(6).max(12),
    subjects: z.array(subjectSchema).min(1).max(SUBJECT_IDS.length),
    taughtChapterKeys: z.array(chapterKey).max(200).default([]),
    exams: z.array(onboardingExamSchema).max(20).default([]),
    schoolStart: timeOfDay,
    schoolEnd: timeOfDay,
    tuitionDays: z.array(z.number().int().min(1).max(6)).max(6).default([]),
    dailyLimitMins: z.union([z.literal(120), z.literal(180), z.literal(240)]),
    timezone,
  })
  .refine((body) => body.schoolEnd > body.schoolStart, {
    message: 'School has to end after it starts',
    path: ['schoolEnd'],
  })
  .openapi('OnboardingRequest');

export const demoBodySchema = z.strictObject({ timezone }).openapi('DemoRequest');

const sharingItemsSchema = z.strictObject({
  hours: z.boolean(),
  streak: z.boolean(),
  coverage: z.boolean(),
  tests: z.boolean(),
  marks: z.boolean(),
});

export const profilePatchSchema = z
  .strictObject({
    ageMode: z.enum(AGE_MODES).optional(),
    examSeason: z.boolean().optional(),
    timezone: timezone.optional(),
    sharing: z
      .strictObject({
        parent: z.boolean().optional(),
        groups: z.boolean().optional(),
        items: sharingItemsSchema.partial().optional(),
      })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')
  .openapi('ProfilePatch');

export const profileSchema = z
  .object({
    name: z.string(),
    cls: z.number().int(),
    board: z.literal('CBSE'),
    timezone: z.string(),
    subjects: z.array(z.enum(SUBJECT_IDS)),
    schoolStart: z.number().int(),
    schoolEnd: z.number().int(),
    tuitionDays: z.array(z.number().int()),
    dailyLimitMins: z.number().int(),
    weeklyGoalMins: z.number().int(),
    ageMode: z.enum(AGE_MODES),
    examSeason: z.boolean(),
    sharing: z.object({ parent: z.boolean(), groups: z.boolean(), items: sharingItemsSchema }),
    isDemo: z.boolean(),
    today: z.string(),
  })
  .openapi('Profile');

export const onboardingResultSchema = z
  .object({ profile: profileSchema, suggested: z.number().int(), firstDate: z.string().nullable() })
  .openapi('OnboardingResult');

export type OnboardingBody = z.infer<typeof onboardingBodySchema>;
export type ProfilePatchBody = z.infer<typeof profilePatchSchema>;
