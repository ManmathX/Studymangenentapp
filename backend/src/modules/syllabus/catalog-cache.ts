/**
 * In-process cache for what students read.
 *
 * - Lists (visible exams and categories) live for `ttlMs` and are dropped whenever an admin
 *   write goes through this process. Other servers catch up within `ttlMs`.
 * - Syllabus payloads are keyed by the published version and its publish time. A published
 *   version can't be edited, so a key never goes stale and needs no cross-server invalidation;
 *   least recently used entries are dropped past `maxEntries`.
 */
export class CatalogCache {
  private readonly lists = new Map<string, { value: Promise<unknown>; expires: number }>();
  private readonly syllabi = new Map<string, Promise<unknown>>();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly maxEntries = 64,
    private readonly now: () => number = Date.now,
  ) {}

  list<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.lists.get(key);
    if (hit && hit.expires > this.now()) return hit.value as Promise<T>;
    const value = load();
    this.lists.set(key, { value, expires: this.now() + this.ttlMs });
    void value.catch(() => this.lists.delete(key));
    return value;
  }

  syllabus<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.syllabi.get(key);
    if (hit) {
      // Re-insert to mark it most recently used.
      this.syllabi.delete(key);
      this.syllabi.set(key, hit);
      return hit as Promise<T>;
    }
    const value = load();
    this.syllabi.set(key, value);
    void value.catch(() => this.syllabi.delete(key));
    while (this.syllabi.size > this.maxEntries) {
      const oldest = this.syllabi.keys().next().value as string;
      this.syllabi.delete(oldest);
    }
    return value;
  }

  /** Called after any admin change to exams, categories or publishing. */
  invalidate(): void {
    this.lists.clear();
  }
}
