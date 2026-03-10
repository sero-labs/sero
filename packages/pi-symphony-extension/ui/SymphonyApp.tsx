/**
 * SymphonyApp — Root component for the Symphony dashboard.
 *
 * Uses useAppState from @sero/app-runtime to read/write the same
 * state.json file the Pi extension writes. Changes from either
 * direction are reflected instantly via file watching.
 */

import { useCallback, useMemo } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { SymphonyState } from '../shared/types';
import { DEFAULT_SYMPHONY_STATE } from '../shared/types';
import { Header } from './components/Header';
import { RunningTable } from './components/RunningTable';
import { RetryQueue } from './components/RetryQueue';
import { TokenTotals } from './components/TokenTotals';
import { WorkflowStatus } from './components/WorkflowStatus';
import { EmptyState } from './components/EmptyState';

// ── Styles ───────────────────────────────────────────────────

const CUSTOM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap');

  .sy-root {
    --sy-bg: #0f1117;
    --sy-bg-surface: #191b23;
    --sy-bg-elevated: #22252f;
    --sy-text: #e8e4df;
    --sy-muted: #8b8d97;
    --sy-dim: #5c5e6a;
    --sy-accent: #818cf8;
    --sy-accent-hover: #a5b4fc;
    --sy-accent-glow: rgba(129, 140, 248, 0.12);
    --sy-success: #34d399;
    --sy-danger: #f87171;
    --sy-warning: #f59e0b;
    --sy-border: rgba(255, 255, 255, 0.07);

    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    background: var(--sy-bg);
    color: var(--sy-text);
  }

  @supports (color: var(--bg-base)) {
    .sy-root {
      --sy-bg: var(--bg-base, #0f1117);
      --sy-bg-surface: var(--bg-surface, #191b23);
      --sy-bg-elevated: var(--bg-elevated, #22252f);
      --sy-text: var(--text-primary, #e8e4df);
      --sy-border: var(--border, rgba(255, 255, 255, 0.07));
    }
  }

  .sy-root h1, .sy-root h2 {
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  }

  .sy-card {
    background: var(--sy-bg-surface);
    border: 1px solid var(--sy-border);
    border-radius: 12px;
    width: 100%;
  }

  .sy-button {
    background: var(--sy-accent);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .sy-button:hover:not(:disabled) {
    background: var(--sy-accent-hover);
    box-shadow: 0 0 20px var(--sy-accent-glow);
  }
  .sy-button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sy-button-ghost {
    background: none;
    border: 1px solid var(--sy-border);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    color: var(--sy-muted);
    transition: all 0.15s;
  }
  .sy-button-ghost:hover:not(:disabled) {
    color: var(--sy-text);
    border-color: var(--sy-accent);
  }
  .sy-button-ghost:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .sy-empty-orb {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, var(--sy-accent) 0%, transparent 70%);
    opacity: 0.15;
    animation: sy-pulse 3s ease-in-out infinite;
  }

  @keyframes sy-pulse {
    0%, 100% { transform: scale(1); opacity: 0.15; }
    50% { transform: scale(1.1); opacity: 0.25; }
  }

  @keyframes sy-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .sy-animate-in {
    animation: sy-fade-in 0.3s ease-out both;
  }
`;

// ── SymphonyApp ──────────────────────────────────────────────

export function SymphonyApp() {
  const [state, updateState] = useAppState<SymphonyState>(DEFAULT_SYMPHONY_STATE);

  const handleStart = useCallback(() => {
    updateState((prev) => ({ ...prev, serviceActive: true }));
  }, [updateState]);

  const handleStop = useCallback(() => {
    updateState((prev) => ({ ...prev, serviceActive: false }));
  }, [updateState]);

  const handleRefresh = useCallback(() => {
    // Trigger refresh by bumping lastPollAt — the state watcher picks this up
    updateState((prev) => ({ ...prev, lastPollAt: new Date().toISOString() }));
  }, [updateState]);

  const hasContent = state.running.length > 0 || state.retrying.length > 0;
  const hasTotals = state.codexTotals.totalTokens > 0 || state.completed.length > 0;

  return (
    <>
      <style>{CUSTOM_STYLES}</style>
      <div className="sy-root flex h-full w-full flex-col overflow-hidden p-4">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <Header
            state={state}
            onStart={handleStart}
            onStop={handleStop}
            onRefresh={handleRefresh}
          />

          {hasContent ? (
            <div className="flex flex-col gap-3 px-1 sy-animate-in">
              <RunningTable running={state.running} />
              <RetryQueue retrying={state.retrying} />
              {hasTotals && (
                <TokenTotals
                  totals={state.codexTotals}
                  completedCount={state.completed.length}
                />
              )}
            </div>
          ) : (
            <EmptyState serviceActive={state.serviceActive} />
          )}

          {!state.workflowValid && state.workflowError && (
            <div className="px-1">
              <WorkflowStatus state={state} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SymphonyApp;
