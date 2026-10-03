/**
 * The current time, ticking once a second while a screen shows a running
 * duration. A timer on screen needs a tick; with nothing to time, nothing runs.
 */

import { useEffect, useState } from 'react';

export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return running ? now : Date.now();
}
