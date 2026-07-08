import { useEffect, useMemo, useRef } from 'react';
import { createDebouncedFn } from '@sero-ai/common';

// The plain (non-hook) factory lives in @sero-ai/common so plugins and stores
// share one implementation. Re-exported here for existing import sites.
export { createDebouncedFn };

/**
 * Returns a stable callback that debounces invocations by `delay` ms.
 * The underlying timer is cleared on unmount.
 *
 * Also exported as a plain (non-hook) factory for use outside React
 * components — see `createDebouncedFn`.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const debounced = useMemo(() => createDebouncedFn((...args: Args) => fnRef.current(...args), delay), [delay]);

  useEffect(() => () => debounced.cancel(), [debounced]);

  return debounced;
}
