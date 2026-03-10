/**
 * useElapsedTimer — simple seconds counter for active collaboration.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Returns the number of elapsed seconds while `active` is true.
 * Resets to 0 when `active` transitions from false → true.
 */
export function useElapsedTimer(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // This is an acceptable useEffect — subscribing to a timer (external source).
  useEffect(() => {
    if (active) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active]);

  return elapsed;
}
