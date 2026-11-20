import { create } from 'zustand';
import { STALE_AFTER_MS } from '../config/env';
import { toApiError } from '../services/api/ApiError';

/**
 * A small cache for screen data. Each entry is { data, error, status, fetchedAt }.
 * Requests for the same key are de-duplicated, fresh data is reused, and after a
 * change only entries that a mounted screen is showing are fetched again.
 */
const inFlight = new Map();
const loaders = new Map();
const subscribers = new Map();

const EMPTY = { data: undefined, error: null, status: 'idle', fetchedAt: 0 };

export const useResourceStore = create((set, get) => ({
  entries: {},
  /** Bumped on every invalidation so paged lists know to reload. */
  epoch: 0,

  entry(key) {
    return get().entries[key] ?? EMPTY;
  },

  async fetch(key, loader, { force = false } = {}) {
    loaders.set(key, loader);
    const current = get().entry(key);
    const fresh = current.status === 'success' && Date.now() - current.fetchedAt < STALE_AFTER_MS;
    if (!force && fresh) return current.data;
    if (inFlight.has(key)) return inFlight.get(key);

    set((state) => ({ entries: { ...state.entries, [key]: { ...current, status: current.data === undefined ? 'loading' : 'refreshing', error: null } } }));
    const promise = loader()
      .then((data) => {
        set((state) => ({ entries: { ...state.entries, [key]: { data, error: null, status: 'success', fetchedAt: Date.now() } } }));
        return data;
      })
      .catch((error) => {
        const apiError = toApiError(error);
        set((state) => ({ entries: { ...state.entries, [key]: { ...get().entry(key), status: 'error', error: apiError } } }));
        throw apiError;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  },

  /** Marks matching entries stale and refetches the ones currently on screen. */
  invalidate(prefixes = ['*']) {
    const matches = (key) => prefixes.some((prefix) => prefix === '*' || key === prefix || key.startsWith(`${prefix}:`));
    set((state) => ({
      epoch: state.epoch + 1,
      entries: Object.fromEntries(Object.entries(state.entries).map(([key, value]) => [key, matches(key) ? { ...value, fetchedAt: 0 } : value])),
    }));
    for (const [key, count] of subscribers) {
      const loader = loaders.get(key);
      if (count > 0 && loader && matches(key)) get().fetch(key, loader, { force: true }).catch(() => {});
    }
  },

  subscribe(key) {
    subscribers.set(key, (subscribers.get(key) ?? 0) + 1);
    return () => subscribers.set(key, Math.max(0, (subscribers.get(key) ?? 1) - 1));
  },

  reset() {
    inFlight.clear();
    set({ entries: {} });
  },
}));
