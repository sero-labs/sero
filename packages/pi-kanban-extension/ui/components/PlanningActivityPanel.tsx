/**
 * PlanningActivityPanel — live progress feed shown while a card
 * is in the planning phase (agent-working status).
 *
 * Shows elapsed time, agent status pills, and a scrolling tool
 * activity feed. Auto-scrolls to latest activity.
 */

import { useEffect, useRef, useState } from 'react';
import type { PlanningProgress } from '../../shared/types';

// ── Tool icons ──────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎', glob: '🔍',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

// ── Component ───────────────────────────────────────────────

export function PlanningActivityPanel({ progress }: { progress?: PlanningProgress }) {
  // Ticking elapsed timer
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!progress?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(progress.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt]);

  // Auto-scroll the tool feed
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress?.recentTools?.length]);

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '8px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        backgroundColor: 'rgba(59, 130, 246, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center"
        style={{ padding: '12px 14px', gap: '10px' }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#60a5fa', flex: 1 }}>
          {progress?.phase ?? 'Planning in progress…'}
        </span>
        {elapsed && (
          <span style={{ fontSize: '10px', color: '#5c5e6a', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Agent status pills */}
      {progress?.agents && progress.agents.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{ padding: '0 14px 10px', gap: '6px' }}
        >
          {progress.agents.map((agent) => (
            <span
              key={agent.name}
              className="inline-flex items-center"
              style={{
                gap: '5px',
                fontSize: '10px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor:
                  agent.status === 'running'
                    ? 'rgba(59, 130, 246, 0.12)'
                    : agent.status === 'completed'
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(248, 113, 113, 0.12)',
                color:
                  agent.status === 'running'
                    ? '#60a5fa'
                    : agent.status === 'completed'
                      ? '#34d399'
                      : '#f87171',
              }}
            >
              {agent.status === 'running' && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: 'currentColor',
                    animation: 'kb-pulse 2s ease-in-out infinite',
                  }}
                />
              )}
              {agent.status === 'completed' && '✓'}
              {agent.name}
            </span>
          ))}
        </div>
      )}

      {/* Tool activity feed */}
      {progress?.recentTools && progress.recentTools.length > 0 && (
        <div
          ref={feedRef}
          style={{
            maxHeight: '160px',
            overflowY: 'auto',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '6px 14px',
          }}
          className="kb-scrollbar"
        >
          {progress.recentTools.map((entry, i) => (
            <div
              key={`${entry.tool}-${i}`}
              className="flex items-center"
              style={{ gap: '6px', padding: '2px 0' }}
            >
              {entry.running ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    animation: 'kb-pulse 1.5s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: '#34d399',
                    flexShrink: 0,
                  }}
                />
              )}
              <span style={{ fontSize: '10px', flexShrink: 0 }}>
                {toolIcon(entry.tool)}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: '#5c5e6a',
                  flexShrink: 0,
                }}
              >
                {entry.tool}
              </span>
              {entry.args && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'rgba(139, 141, 151, 0.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {entry.args}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback when no progress data yet */}
      {(!progress || (progress.recentTools.length === 0 && progress.agents.length === 0)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          Analysing codebase and generating implementation plan with subtasks.
        </p>
      )}
    </div>
  );
}
