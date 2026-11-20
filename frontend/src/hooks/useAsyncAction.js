import { useCallback, useRef, useState } from 'react';

/** Wraps an async action with a pending flag and ignores double taps while it runs. */
export function useAsyncAction(action) {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const execute = useCallback(
    async (...args) => {
      if (running.current) return undefined;
      running.current = true;
      setPending(true);
      try {
        return await action(...args);
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [action],
  );
  return { execute, pending };
}
