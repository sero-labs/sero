/**
 * The wait while a planner works: a spinner and the real time since the
 * request, with the eye beside the time. The Room wait and the Workflow
 * planning screen both render this, so the rule has one shape wherever it
 * applies (#540 frame 2).
 *
 * The planner reports nothing until it returns, so the screen shows no steps, no
 * bar, no percentage and no countdown. The spinner is the one allowed animation:
 * work is genuinely in flight, and it stops under `prefers-reduced-motion`.
 *
 * The elapsed figure is the difference from the mount time, not a count of
 * interval callbacks: a delayed or throttled timer would otherwise leave the
 * clock permanently behind the request it claims to measure.
 *
 * The eye opens the planner's reply as the model writes it. It appears only
 * when the caller knows which run to watch.
 */

import { useEffect, useState } from 'react';
import { SubagentLiveBlock } from '@sero-ai/ui';
import { Eye } from 'lucide-react';
import { formatTimer } from '../lib/format';

export function PlannerWait({ title, runId }: { title: string; runId?: string }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => startedAt);
  const [watching, setWatching] = useState(false);
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
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="room-tabular text-xs text-room-text3">{formatTimer(now - startedAt)}</span>
        {runId && (
          <button
            type="button"
            className={`grid size-6 shrink-0 place-items-center rounded-[5px] text-room-text3 hover:bg-room-overlay hover:text-room-text${watching ? ' bg-room-overlay text-room-text' : ''}`}
            onClick={() => setWatching((open) => !open)}
            aria-expanded={watching}
            aria-label={`Watch the agent for ${title}`}
            title="Watch the agent"
          >
            <Eye className="size-3.5" />
          </button>
        )}
      </div>
      {watching && runId && (
        <SubagentLiveBlock className="mt-4 w-full text-left" runId={runId} monospace />
      )}
    </div>
  );
}
