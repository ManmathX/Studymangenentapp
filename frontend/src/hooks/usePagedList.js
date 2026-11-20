import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../services/api/ApiError';
import { useResourceStore } from '../store/resourceStore';

/**
 * Infinite list over a paginated endpoint. `loadPage(page)` resolves to { data, meta }.
 * Reloads from page 1 whenever cached data is invalidated by a change elsewhere.
 */
export function usePagedList(loadPage) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const epoch = useResourceStore((state) => state.epoch);
  const request = useRef(0);

  const load = useCallback(
    async (nextPage) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      try {
        const { data, meta } = await loadPage(nextPage);
        if (id !== request.current) return;
        setItems((current) => (nextPage === 1 ? data : [...current, ...data]));
        setPage(nextPage);
        setHasNext(Boolean(meta?.hasNext));
      } catch (caught) {
        if (id === request.current) setError(toApiError(caught));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [loadPage],
  );

  useEffect(() => {
    load(1);
  }, [load, epoch]);

  const loadMore = useCallback(() => {
    if (!loading && hasNext && !error) load(page + 1);
  }, [error, hasNext, load, loading, page]);

  return { items, loading, error, hasNext, loadMore, reload: () => load(1) };
}
