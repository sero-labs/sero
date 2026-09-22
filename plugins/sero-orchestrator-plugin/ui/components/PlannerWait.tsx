/**
 * The wait while a planner works: a spinner and the real time since the
 * request. The Room wait and the Workflow planning screen both render this, so
 * the rule has one shape wherever it applies (#540 frame 2).
 *
 * The planner reports nothing until it returns, so the screen shows no steps, no
 * bar, no percentage and no countdown. The spinner is the one allowed animation:
 * work is genuinely in flight, and it stops under `prefers-reduced-motion`.
 *
 * The elapsed figure is the difference from the mount time, not a count of
 * interval callbacks: a delayed or throttled timer would otherwise leave the
 * clock permanently behind the request it claims to measure.
 */

import { useEffect, useRef, useState } from 'react';
import { formatTimer } from '../lib/format';

export function PlannerWait({ title }: { title: string }) {
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(startedAt.current);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto mt-16 flex w-full max-w-[46rem] flex-col items-center px-6 py-16 text-center">
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-room-text">{title}</h3>
      <span
        role="status"
        aria-label={title}
        className="mt-4 size-5 animate-spin rounded-full border-2 border-room-line-strong border-t-brand-primary motion-reduce:animate-none"
      />
      <span className="room-tabular mt-2.5 text-xs text-room-text3">{formatTimer(now - startedAt.current)}</span>
    </div>
  );
}
