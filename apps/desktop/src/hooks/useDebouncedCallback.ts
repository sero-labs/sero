import { useEffect, useMemo, useRef } from 'react';

interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void;
  cancel: () => void;
}

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

/**
 * Non-hook debounce factory for use in stores / plain modules.
 * Returns a debounced wrapper that coalesces rapid calls.
 */
export function createDebouncedFn<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): DebouncedCallback<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
