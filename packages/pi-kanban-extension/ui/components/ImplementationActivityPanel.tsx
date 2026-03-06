/**
 * ImplementationActivityPanel — live progress feed shown while a card
 * is in the implementation phase (in-progress + agent-working status).
 *
 * Shows wave progress, subtask agent status pills, elapsed time,
 * and a scrolling tool activity feed.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Card, ImplementationProgress } from '../../shared/types';

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

export function ImplementationActivityPanel({
  card,
  progress,
}: {
  card: Card;
  progress?: ImplementationProgress;
}) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!progress?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(progress.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [progress?.startedAt]);

  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress?.recentTools?.length]);

  const completedCount = card.subtasks.filter((s) => s.status === 'completed').length;
  const totalCount = card.subtasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '8px',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        backgroundColor: 'rgba(99, 102, 241, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Overall progress bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
        }}
      >
        <motion.div
          style={{
            height: '100%',
            backgroundColor: '#818cf8',
            borderRadius: '0 2px 2px 0',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

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
            backgroundColor: '#818cf8',
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: '#a5b4fc', flex: 1 }}>
          {progress?.phase ?? 'Implementing…'}
        </span>
        <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {completedCount}/{totalCount}
        </span>
        {elapsed && (
          <span style={{ fontSize: '10px', color: '#5c5e6a', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Wave indicator */}
      {progress && progress.totalWaves > 0 && (
        <div style={{ padding: '0 14px 8px' }}>
          <div className="flex" style={{ gap: '3px' }}>
            {Array.from({ length: progress.totalWaves }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  backgroundColor:
                    i + 1 < progress.currentWave
                      ? '#34d399'
                      : i + 1 === progress.currentWave
                        ? '#818cf8'
                        : 'rgba(255, 255, 255, 0.06)',
                  transition: 'background-color 0.3s',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agent status pills */}
      {progress?.agents && progress.agents.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{ padding: '0 14px 10px', gap: '6px' }}
        >
          {progress.agents.map((agent, idx) => (
            <span
              key={`${agent.name}-${idx}`}
              className="inline-flex items-center"
              style={{
                gap: '5px',
                fontSize: '10px',
                fontWeight: 500,
                padding: '3px 8px',
                borderRadius: '4px',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                backgroundColor:
                  agent.status === 'running'
                    ? 'rgba(129, 140, 248, 0.12)'
                    : agent.status === 'completed'
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(248, 113, 113, 0.12)',
                color:
                  agent.status === 'running'
                    ? '#a5b4fc'
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
                    flexShrink: 0,
                  }}
                />
              )}
              {agent.status === 'completed' && '✓'}
              {agent.status === 'failed' && '✗'}
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
              <span
                style={{
                  display: 'inline-block',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: entry.running ? '#818cf8' : '#34d399',
                  animation: entry.running ? 'kb-pulse 1.5s ease-in-out infinite' : undefined,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '10px', flexShrink: 0 }}>
                {toolIcon(entry.tool)}
              </span>
              <span style={{ fontSize: '10px', fontWeight: 500, color: '#5c5e6a', flexShrink: 0 }}>
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

      {/* Fallback */}
      {(!progress || (progress.recentTools.length === 0 && progress.agents.length === 0)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          Executing subtasks in dependency order with parallel agents.
        </p>
      )}
    </div>
  );
}
