import { useEffect, useMemo, useRef } from 'react';

/**
 * Debounce that keeps the latest arguments and cancels on unmount.
 *
 * Tweak autosave uses this so a slider drag produces one write instead of one
 * per pointer event.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const latest = useRef(callback);
  latest.current = callback;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return useMemo(() => (...args: TArgs) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      latest.current(...args);
    }, delayMs);
  }, [delayMs]);
}
