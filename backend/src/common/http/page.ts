import { z } from '../zod.js';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageMetaSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    hasNext: z.boolean(),
  })
  .openapi('PageMeta');

export type PageMeta = z.infer<typeof pageMetaSchema>;

/** A page of results. Route handlers return this to emit `meta` beside `data`. */
export class PageResult<T> {
  readonly meta: PageMeta;

  constructor(
    readonly items: T[],
    total: number,
    query: PaginationQuery,
  ) {
    this.meta = {
      page: query.page,
      limit: query.limit,
      total,
      hasNext: query.page * query.limit < total,
    };
  }
}

export function skipFor(query: PaginationQuery): number {
  return (query.page - 1) * query.limit;
}
