import { z } from '../zod.js';
import { SUBJECT_ID_PATTERN } from '../../modules/syllabus/syllabus.data.js';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a valid id')
  .openapi({ example: '665f1c2b9a1e4b0012345678' });

export const idParamsSchema = z.object({ id: objectIdSchema });

/** A subject id in the syllabus catalogue. */
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

export const trimmedText = (min: number, max: number) => z.string().trim().min(min).max(max);
