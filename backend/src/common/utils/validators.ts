import { z } from '../zod.js';
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

export const subjectSchema = z.enum(['maths', 'science', 'sst', 'english', 'hindi']);

export const trimmedText = (min: number, max: number) => z.string().trim().min(min).max(max);
