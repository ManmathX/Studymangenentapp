import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../services/api/ApiError';
import { useResourceStore } from '../store/resourceStore';

/**
 * Infinite list over a paginated endpoint. `loadPage(page)` resolves to { data, meta }.
 * Reloads from page 1 whenever cached data is invalidated by a change elsewhere,
 * keeping the current rows on screen until the fresh page arrives.
 */
export function usePagedList(loadPage) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const epoch = useResourceStore((state) => state.epoch);
  const request = useRef(0);

  /** Applies a finished request, ignoring any answer that a newer request has superseded. */
  const settle = useCallback((id, nextPage, outcome) => {
    if (id !== request.current) return;
    if (outcome.error) {
      setError(outcome.error);
    } else {
      setItems((current) => (nextPage === 1 ? outcome.data : [...current, ...outcome.data]));
      setPage(nextPage);
      setHasNext(Boolean(outcome.meta?.hasNext));
      setError(null);
    }
    setLoading(false);
  }, []);

  /** Fetches one page. State only changes in the response callbacks, so effects may call it. */
  const fetchPage = useCallback(
    (nextPage) => {
      const id = ++request.current;
      return loadPage(nextPage).then(
        ({ data, meta }) => settle(id, nextPage, { data, meta }),
        (caught) => settle(id, nextPage, { error: toApiError(caught) }),
      );
    },
    [loadPage, settle],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage, epoch]);

  const loadMore = useCallback(() => {
    if (loading || !hasNext || error) return;
    setLoading(true);
    fetchPage(page + 1);
  }, [error, fetchPage, hasNext, loading, page]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPage(1);
  }, [fetchPage]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPage(page + 1);
  }, [fetchPage, page]);

  return { items, loading, error, hasNext, loadMore, reload, retry };
}
