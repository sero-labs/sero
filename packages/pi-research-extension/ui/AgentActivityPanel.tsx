/**
 * AgentActivityPanel — live tool activity feed for a research agent.
 *
 * Similar to the Kanban ActivityPanel but standalone — no motion dependency,
 * inline styles, federated-module-safe.
 */

import { useEffect, useRef, useState } from 'react';
import type { AgentActivity } from './useResearchActivity';

// ── Tool icons ──────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎', glob: '🔍',
  search: '🌐', research: '🔬', extract: '📄', crawl: '🕷️',
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

interface AgentActivityPanelProps {
  activity: AgentActivity;
}

export function AgentActivityPanel({ activity }: AgentActivityPanelProps) {
  const isRunning = activity.status === 'running' || activity.status === 'queued';
  const isFailed = activity.status === 'failed' || activity.status === 'timed_out';

  // Elapsed timer
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!isRunning) return;
    const tick = () => setElapsed(formatElapsed(activity.startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, activity.startedAt]);

  const hasTools = activity.tools.length > 0;
  const hasOutput = activity.liveOutput.length > 0;

  const accentColor = isFailed ? 'var(--rs-danger)' : 'var(--rs-accent)';

  return (
    <div style={{
      borderRadius: 6,
      border: `1px solid ${isFailed ? 'rgba(248, 113, 113, 0.2)' : 'rgba(129, 140, 248, 0.15)'}`,
      background: isFailed ? 'rgba(248, 113, 113, 0.04)' : 'rgba(129, 140, 248, 0.04)',
      overflow: 'hidden',
      marginTop: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        {isRunning && (
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            backgroundColor: accentColor,
            animation: 'rs-pulse 2s ease-in-out infinite',
            flexShrink: 0,
          }} />
        )}
        <span style={{ fontSize: 11, fontWeight: 500, color: accentColor, flex: 1 }}>
          {isFailed ? 'Failed' : isRunning ? 'Working…' : 'Completed'}
        </span>
        {elapsed && (
          <span style={{ fontSize: 10, color: 'var(--rs-dim)', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Tool feed */}
      {hasTools && <ToolFeed tools={activity.tools} accentColor={accentColor} />}

      {/* Live output snippet */}
      {hasOutput && isRunning && <LiveOutputPreview text={activity.liveOutput} />}

      {/* Error */}
      {activity.error && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--rs-danger)', lineHeight: 1.4 }}>
          {activity.error}
        </div>
      )}

      {/* Empty state */}
      {!hasTools && !hasOutput && !activity.error && isRunning && (
        <p style={{ fontSize: 11, color: 'var(--rs-dim)', padding: '0 10px 8px', lineHeight: 1.4 }}>
          Waiting for first tool call…
        </p>
      )}
    </div>
  );
}

// ── Tool feed ───────────────────────────────────────────────

function ToolFeed({ tools, accentColor }: {
  tools: Array<{ toolName: string; argsSummary: string; running: boolean }>;
  accentColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [tools.length]);

  return (
    <div ref={ref} style={{
      maxHeight: 130, overflowY: 'auto', padding: '2px 10px 6px',
      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    }}>
      {tools.map((t, i) => (
        <div key={`${t.toolName}-${i}`} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0',
        }}>
          <span style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            backgroundColor: t.running ? accentColor : 'var(--rs-success)',
            animation: t.running ? 'rs-pulse 1.5s ease-in-out infinite' : undefined,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, flexShrink: 0 }}>{toolIcon(t.toolName)}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--rs-dim)', flexShrink: 0 }}>
            {t.toolName}
          </span>
          {t.argsSummary && (
            <span style={{
              fontSize: 10, color: 'rgba(139, 141, 151, 0.5)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}>
              {t.argsSummary}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Live output preview ─────────────────────────────────────

function LiveOutputPreview({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  const preview = text.length > 400 ? '…' + text.slice(-400) : text;

  return (
    <pre style={{
      maxHeight: 80, overflowY: 'auto', margin: '0 10px 6px',
      padding: 6, borderRadius: 4, fontSize: 10, lineHeight: 1.5,
      background: 'var(--rs-bg)', color: 'rgba(139, 141, 151, 0.7)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    }}>
      {preview}
    </pre>
  );
}
