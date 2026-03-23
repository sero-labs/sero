/**
 * WeightTracker — main Sero web UI for the weight tracker extension.
 *
 * Uses useAppState from @sero-ai/app-runtime to read/write the same
 * state.json file the Pi extension writes. Changes from either
 * direction are reflected instantly via file watching.
 *
 * Design: clean, supportive health companion — indigo/purple accents,
 * calming dark tones, gentle encouragement messaging.
 */

import { useCallback, useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { WeightTrackerState, WeightEntry } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { getEncouragement, sortedEntries, formatWeight, unitLabel, todayISO } from './utils';
import { WeightChart } from './WeightChart';
import { StatCards } from './StatCards';
import { EntryList } from './EntryList';
import { AddEntryForm } from './AddEntryForm';

// ── Styles (injected via <style> tag) ────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .wt-root {
    --wt-bg: #0f1117;
    --wt-bg-surface: #191b23;
    --wt-bg-elevated: #22252f;
    --wt-text: #e8e4df;
    --wt-muted: #8b8d97;
    --wt-dim: #5c5e6a;
    --wt-accent: #818cf8;
    --wt-accent-hover: #a5b4fc;
    --wt-accent-glow: rgba(129, 140, 248, 0.12);
    --wt-success: #34d399;
    --wt-warning: #fb923c;
    --wt-goal: #c084fc;
    --wt-grid: rgba(255, 255, 255, 0.05);
    --wt-border: rgba(255, 255, 255, 0.07);

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--wt-bg);
    color: var(--wt-text);
  }

  /* Use host bg in Sero context */
  @supports (color: var(--bg-base)) {
    .wt-root {
      --wt-bg: var(--bg-base, #0f1117);
      --wt-bg-surface: var(--bg-surface, #191b23);
      --wt-bg-elevated: var(--bg-elevated, #22252f);
      --wt-text: var(--text-primary, #e8e4df);
      --wt-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .wt-root h1, .wt-root h2 {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    font-weight: 500;
  }

  .wt-card {
    background: var(--wt-bg-surface);
    border: 1px solid var(--wt-border);
    border-radius: 12px;
    padding: 12px 14px;
    width: 100%;
  }

  .wt-input {
    background: var(--wt-bg-elevated);
    border: 1px solid var(--wt-border);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--wt-text);
    font-family: 'DM Sans', sans-serif;
    outline: none;
    transition: border-color 0.15s;
  }
  .wt-input::placeholder { color: var(--wt-dim); }
  .wt-input:focus { border-color: var(--wt-accent); }
  .wt-input[type="date"] { color-scheme: dark; }

  .wt-button {
    background: var(--wt-accent);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
  }
  .wt-button:hover:not(:disabled) {
    background: var(--wt-accent-hover);
    box-shadow: 0 0 20px var(--wt-accent-glow);
  }
  .wt-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .wt-encouragement {
    background: var(--wt-accent-glow);
    border-left: 2px solid var(--wt-accent);
    border-radius: 0 8px 8px 0;
    padding: 10px 14px;
    margin: 0 20px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--wt-text);
    font-style: italic;
  }

  .wt-empty-orb {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, var(--wt-accent) 0%, transparent 70%);
    opacity: 0.15;
    animation: wt-pulse 3s ease-in-out infinite;
  }

  @keyframes wt-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.1); opacity: 0.25; }
  }

  @keyframes wt-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .wt-animate-in {
    animation: wt-fade-in 0.4s ease-out both;
  }
`;

// ── Main Component ───────────────────────────────────────────

export function WeightTracker() {
  const [state, updateState] = useAppState<WeightTrackerState>(DEFAULT_STATE);

  const sorted = useMemo(() => sortedEntries(state.entries), [state.entries]);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  const encouragement = useMemo(
    () => state.entries.length > 0 ? getEncouragement(state.entries, state.goal) : null,
    [state.entries, state.goal],
  );

  const addEntry = useCallback(
    (weight: number, date: string, note?: string) => {
      updateState((prev) => ({
        ...prev,
        entries: [
          ...prev.entries,
          {
            id: prev.nextId,
            weight,
            date,
            note,
            createdAt: new Date().toISOString(),
          },
        ],
        nextId: prev.nextId + 1,
      }));
    },
    [updateState],
  );

  const removeEntry = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        entries: prev.entries.filter((e) => e.id !== id),
      }));
    },
    [updateState],
  );

  const hasEntries = state.entries.length > 0;

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="wt-root flex h-full w-full flex-col overflow-hidden p-2">
        <div className="wt-card flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 pb-2 pt-5">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl tracking-tight" style={{ color: 'var(--wt-text)' }}>
              Weight Tracker
            </h1>
            {latest && (
              <p className="text-right">
                <span className="text-2xl font-light tabular-nums" style={{ color: 'var(--wt-accent)' }}>
                  {formatWeight(latest.weight, state.unit)}
                </span>
                <span className="ml-1 text-xs" style={{ color: 'var(--wt-muted)' }}>
                  {unitLabel(state.unit)}
                </span>
              </p>
            )}
          </div>
          {!hasEntries && (
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--wt-muted)' }}>
              Track your progress, celebrate every step
            </p>
          )}
        </div>

        {/* Add entry form */}
        <div className="shrink-0">
          <AddEntryForm unit={state.unit} onAdd={addEntry} />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {hasEntries ? (
            <div className="wt-animate-in">
              {/* Encouragement banner */}
              {encouragement && (
                <div className="py-3">
                  <div className="wt-encouragement">{encouragement}</div>
                </div>
              )}

              {/* Stats */}
              <StatCards entries={state.entries} unit={state.unit} goal={state.goal} />

              {/* Chart */}
              {state.entries.length >= 2 && (
                <div className="px-3 py-2">
                  <WeightChart entries={state.entries} unit={state.unit} goal={state.goal} />
                </div>
              )}

              {/* Entry list */}
              <EntryList entries={state.entries} unit={state.unit} onRemove={removeEntry} />
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
        </div>
      </div>
    </>
  );
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center wt-animate-in">
      <div className="wt-empty-orb mb-6" />
      <h2 className="text-lg" style={{ color: 'var(--wt-text)' }}>
        Begin your journey
      </h2>
      <p
        className="mt-2 max-w-[220px] text-lg leading-relaxed"
        style={{ color: 'var(--wt-muted)' }}
      >
        Log your first weigh-in above, or ask me to track it for you.
        Every step forward counts.
      </p>
    </div>
  );
}

export default WeightTracker;
