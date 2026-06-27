import { useEffect, useRef, useState } from 'react';
import { getSeroApi } from '@sero-ai/app-runtime';

/**
 * Reactively reads and watches a JSON file by absolute path through the Sero
 * bridge. Pass `null` to watch nothing (returns the fallback). Used to follow
 * the loop index and the selected loop's own file independently, so the detail
 * view updates live without reading every loop.
 */
export function useWatchedJson<T>(filePath: string | null, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  const fallbackRef = useRef<T>(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (!filePath) {
      setData(fallbackRef.current);
      return;
    }
    const api = getSeroApi().appState;
    let active = true;
    setData(fallbackRef.current); // reset while the new path loads

    const unsubscribe = api.onChange<T | null>((changedPath, value) => {
      if (!active || changedPath !== filePath) return;
      setData(value == null ? fallbackRef.current : value);
    });
    void api.watch<T | null>(filePath).then((current) => {
      if (active) setData(current == null ? fallbackRef.current : current);
    });

    return () => {
      active = false;
      unsubscribe();
      void api.unwatch(filePath);
    };
  }, [filePath]);

  return data;
}
