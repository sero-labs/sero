/**
 * IssueRow — single running issue row with expand/collapse.
 */

import { useState } from 'react';
import type { RunningEntry } from '../../shared/types';
import { formatDuration, formatTokens, formatTimestamp, formatPhase } from '../lib/format';

interface IssueRowProps {
  entry: RunningEntry;
}

const PHASE_COLORS: Record<string, string> = {
  preparing_workspace: '#f59e0b',
  building_prompt: '#f59e0b',
  launching_agent: '#3b82f6',
  initializing_session: '#3b82f6',
  streaming_turn: '#818cf8',
  finishing: '#34d399',
  succeeded: '#34d399',
  failed: '#f87171',
  timed_out: '#f87171',
  stalled: '#f87171',
  canceled_by_reconciliation: '#8b8d97',
};

export function IssueRow({ entry }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const elapsed = Date.now() - new Date(entry.startedAt).getTime();
  const phaseColor = PHASE_COLORS[entry.phase] ?? 'var(--sy-muted)';

  return (
    <div className="px-4 py-3">
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ChevronIcon expanded={expanded} />

        <span className="text-xs font-medium" style={{ color: 'var(--sy-accent)' }}>
          {entry.identifier}
        </span>

        <span className="flex-1 truncate text-sm" style={{ color: 'var(--sy-text)' }}>
          {entry.issue.title}
        </span>

        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: `${phaseColor}1a`, color: phaseColor }}
        >
          {formatPhase(entry.phase)}
        </span>

        <span className="text-xs tabular-nums" style={{ color: 'var(--sy-muted)' }}>
          T{entry.turnCount}
        </span>

        <span className="text-xs tabular-nums" style={{ color: 'var(--sy-dim)' }}>
          {formatDuration(elapsed)}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-2 ml-6 grid grid-cols-2 gap-x-6 gap-y-1 text-xs"
          style={{ color: 'var(--sy-muted)' }}
        >
          <DetailItem label="Session" value={entry.sessionId ?? '—'} />
          <DetailItem label="Input tokens" value={formatTokens(entry.agentInputTokens)} />
          <DetailItem label="Output tokens" value={formatTokens(entry.agentOutputTokens)} />
          <DetailItem label="Total tokens" value={formatTokens(entry.agentTotalTokens)} />
          <DetailItem label="Last event" value={entry.lastAgentEvent ?? '—'} />
          <DetailItem label="Last activity" value={formatTimestamp(entry.lastAgentTimestamp)} />
          {entry.lastAgentMessage && (
            <div className="col-span-2 mt-1">
              <span style={{ color: 'var(--sy-dim)' }}>Last message: </span>
              <span style={{ color: 'var(--sy-text)' }}>{entry.lastAgentMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: 'var(--sy-dim)' }}>{label}: </span>
      <span style={{ color: 'var(--sy-text)' }}>{value}</span>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{
        color: 'var(--sy-dim)',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s',
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
