import { useCallback, useEffect, useRef } from 'react';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

/**
 * Non-hook debounce factory for use in stores / plain modules.
 * Returns a debounced wrapper that coalesces rapid calls.
 */
export function createDebouncedFn<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
