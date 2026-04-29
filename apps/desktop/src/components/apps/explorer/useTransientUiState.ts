import { useCallback, useEffect, useRef, useState } from 'react';

export function useTransientValue<T>(durationMs: number) {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setValue(null);
  }, []);

  const show = useCallback((nextValue: T) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setValue(nextValue);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setValue(null);
    }, durationMs);
  }, [durationMs]);

  useEffect(() => clear, [clear]);

  return [value, show, clear] as const;
}

export function useTransientFlag(durationMs: number) {
  const [value, show, clear] = useTransientValue<true>(durationMs);
  return [value === true, () => show(true), clear] as const;
}
