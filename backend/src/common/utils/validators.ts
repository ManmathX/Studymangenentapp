import { z } from '../zod.js';
import {
  CHAPTER_KEY_PATTERN,
  CUSTOM_SUBJECT_ID_PATTERN,
  SUBJECT_ID_PATTERN,
} from '../../modules/syllabus/syllabus.data.js';
import { isValidDateKey } from './dates.js';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a valid id')
  .openapi({ example: '665f1c2b9a1e4b0012345678' });

export const idParamsSchema = z.object({ id: objectIdSchema });

export const dateKeySchema = z
  .string()
  .refine(isValidDateKey, 'Must be a date in YYYY-MM-DD format')
  .openapi({ example: '2026-11-19' });

/** A subject the student added during setup: `custom1` … `custom6`. */
export const customSubjectIdSchema = z
  .string()
  .regex(CUSTOM_SUBJECT_ID_PATTERN, 'Unknown subject')
  .openapi({ example: 'custom1' });

/** A catalogue subject or one the student added. Services check it is on the student's profile. */
export const subjectSchema = z
  .string()
  .regex(SUBJECT_ID_PATTERN, 'Unknown subject')
  .openapi({ example: 'maths' });

/** Board codes are lowercase slugs: `cbse`, `icse`, `odisha`… */
export const boardCodeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, 'Use lowercase letters, numbers and dashes')
  .openapi({ example: 'cbse' });

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #5AC8FA')
  .openapi({ example: '#5AC8FA' });

export const chapterKeySchema = z
  .string()
  .regex(CHAPTER_KEY_PATTERN, 'Invalid chapter key')
  .openapi({ example: 'maths-3' });

export const trimmedText = (min: number, max: number) => z.string().trim().min(min).max(max);
