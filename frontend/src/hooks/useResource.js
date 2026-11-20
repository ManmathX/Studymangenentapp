import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { useResourceStore } from '../store/resourceStore';

const EMPTY = { data: undefined, error: null, status: 'idle', fetchedAt: 0 };

/**
 * Screen data from the shared cache. Loads when the screen gains focus (unless the
 * cached copy is fresh) and refetches automatically after related changes.
 */
export function useResource(resource, { enabled = true } = {}) {
  const { key, load } = resource;
  const entry = useResourceStore(useCallback((state) => state.entries[key] ?? EMPTY, [key]));

  useEffect(() => (enabled ? useResourceStore.getState().subscribe(key) : undefined), [key, enabled]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) useResourceStore.getState().fetch(key, load).catch(() => {});
      // `load` is derived from `key`; refetching on key change is enough.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled]),
  );

  const refresh = useCallback(
    () => useResourceStore.getState().fetch(key, load, { force: true }).catch(() => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return {
    data: entry.data,
    error: entry.error,
    isLoading: entry.data === undefined && (entry.status === 'loading' || (entry.status === 'idle' && enabled)),
    isRefreshing: entry.status === 'refreshing',
    refresh,
  };
}
