/**
 * Header — service status, start/stop toggle, refresh, workflow info.
 */

import type { SymphonyState } from '../../shared/types';

interface HeaderProps {
  state: SymphonyState;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onCreateIssue?: () => void;
}

export function Header({ state, onStart, onStop, onRefresh, onCreateIssue }: HeaderProps) {
  const statusColor = state.serviceActive
    ? 'var(--sy-success)'
    : 'var(--sy-dim)';
  const statusLabel = state.serviceActive ? 'Active' : 'Stopped';

  return (
    <div className="shrink-0 px-5 pb-3 pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1
            className="text-xl tracking-tight"
            style={{ color: 'var(--sy-text)', fontWeight: 500 }}
          >
            Symphony
          </h1>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: state.serviceActive
                ? 'rgba(52, 211, 153, 0.12)'
                : 'rgba(92, 94, 106, 0.12)',
              color: statusColor,
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: statusColor }}
            />
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCreateIssue && state.trackerKind === 'file' && (
            <button
              onClick={onCreateIssue}
              className="sy-button-ghost"
              title="Create new issue"
            >
              <PlusIcon />
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={!state.serviceActive}
            className="sy-button-ghost"
            title="Trigger immediate poll"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={state.serviceActive ? onStop : onStart}
            className="sy-button"
          >
            {state.serviceActive ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Workflow + tracker info */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--sy-muted)' }}>
        {state.trackerKind && (
          <span>
            Tracker: <span style={{ color: 'var(--sy-text)' }}>{state.trackerKind}</span>
            {state.trackerLabel && (
              <span style={{ color: 'var(--sy-dim)' }}> ({state.trackerLabel})</span>
            )}
          </span>
        )}
        <span>
          Poll: <span style={{ color: 'var(--sy-text)' }}>{(state.pollIntervalMs / 1000).toFixed(0)}s</span>
        </span>
        <span>
          Slots: <span style={{ color: 'var(--sy-text)' }}>{state.running.length}/{state.maxConcurrentAgents}</span>
        </span>
        {!state.workflowValid && state.workflowError && (
          <span style={{ color: 'var(--sy-danger)' }}>
            Workflow error: {state.workflowError}
          </span>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
