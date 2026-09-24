import { Check, CircleHelp, CircleSlash, Pause, RefreshCw, X } from 'lucide-react';
import type { ActivityGroup, ActivityState } from '../lib/trace';

/** Every activity group, in the order the filter chips show them. */
export const GROUP_LABEL: Record<ActivityGroup, string> = {
  owner: 'Owner',
  research: 'Research',
  planning: 'Planning',
  rooms: 'Rooms',
  workflows: 'Workflows',
  evaluation: 'Evaluation',
  repair: 'Repair',
  waits: 'Waits',
  unassigned: 'Unassigned',
};

/** The word for a state. The icon beside it is decoration, so colour never carries it alone. */
export const STATE_WORD: Record<ActivityState, string> = {
  done: 'done',
  running: 'running',
  waiting: 'waiting',
  failed: 'failed',
  aborted: 'stopped',
  unknown: 'unknown',
};

function HalfCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StateIcon({ state }: { state: ActivityState }) {
  if (state === 'done') return <Check aria-hidden="true" />;
  if (state === 'running') return <HalfCircle />;
  if (state === 'waiting') return <Pause aria-hidden="true" />;
  if (state === 'failed') return <X aria-hidden="true" />;
  if (state === 'aborted') return <CircleSlash aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

export function StateChip({ state }: { state: ActivityState }) {
  return <span className="ar-state-chip"><StateIcon state={state} />{STATE_WORD[state]}</span>;
}

/** The status legend under the charts: each icon with its word. */
export function StateLegend() {
  return (
    <>
      {(['done', 'running', 'waiting', 'failed', 'unknown'] as const).map((state) => (
        <span key={state}><StateIcon state={state} />{STATE_WORD[state]}</span>
      ))}
      <span><RefreshCw aria-hidden="true" />retry</span>
    </>
  );
}
