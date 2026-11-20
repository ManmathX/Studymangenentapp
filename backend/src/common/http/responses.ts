import { z } from '../zod.js';
import { pageMetaSchema } from './page.js';

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
      requestId: z.string(),
    }),
  })
  .openapi('ErrorResponse');

export function successEnvelope(data: z.ZodType, paginated = false): z.ZodType {
  return z.object({
    success: z.literal(true),
    data: paginated ? z.array(data) : data,
    ...(paginated ? { meta: pageMetaSchema } : {}),
  });
}
