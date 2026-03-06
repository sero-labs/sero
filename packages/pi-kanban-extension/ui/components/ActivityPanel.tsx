/**
 * ActivityPanel — shared activity feed component used by all three
 * phase panels (Planning, Implementation, Review).
 *
 * Renders: pulsing phase header, elapsed timer, agent status pills,
 * and a scrolling tool activity feed. Each consumer passes a colour
 * theme and optional extra content (above/below slots).
 */

import { useEffect, useRef, useState } from 'react';
import type { PlanningToolEntry } from '../../shared/types';

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

// ── Types ───────────────────────────────────────────────────

export interface ActivityPanelTheme {
  /** Primary colour for the pulsing dot and active agent pills (CSS colour string). */
  primary: string;
  /** Lighter tint of primary for text labels. */
  primaryText: string;
  /** Border colour with alpha. */
  border: string;
  /** Background colour with alpha. */
  background: string;
  /** Agent pill running background with alpha. */
  agentRunningBg: string;
}

export interface ActivityPanelData {
  phase?: string;
  startedAt?: number;
  agents?: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools?: PlanningToolEntry[];
}

interface ActivityPanelProps {
  theme: ActivityPanelTheme;
  data?: ActivityPanelData;
  /** Default phase text when no data yet. */
  defaultPhase: string;
  /** Fallback description when no agents/tools are active. */
  fallbackText: string;
  /** Content rendered above the agent pills (e.g. progress bar, wave indicator). */
  headerSlot?: React.ReactNode;
  /** Extra content rendered in the header row (e.g. subtask counter). */
  headerExtra?: React.ReactNode;
  /** Max height for the tool feed. Default: 160. */
  feedMaxHeight?: number;
}

// ── Component ───────────────────────────────────────────────

export function ActivityPanel({
  theme,
  data,
  defaultPhase,
  fallbackText,
  headerSlot,
  headerExtra,
  feedMaxHeight = 160,
}: ActivityPanelProps) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!data?.startedAt) return;
    const tick = () => setElapsed(formatElapsed(data.startedAt!));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data?.startedAt]);

  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [data?.recentTools?.length]);

  const hasAgents = (data?.agents?.length ?? 0) > 0;
  const hasTools = (data?.recentTools?.length ?? 0) > 0;

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '8px',
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.background,
        overflow: 'hidden',
      }}
    >
      {headerSlot}

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
            backgroundColor: theme.primary,
            animation: 'kb-pulse 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 500, color: theme.primaryText, flex: 1 }}>
          {data?.phase ?? defaultPhase}
        </span>
        {headerExtra}
        {elapsed && (
          <span style={{ fontSize: '10px', color: '#5c5e6a', fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* Agent status pills */}
      {hasAgents && (
        <div
          className="flex flex-wrap"
          style={{ padding: '0 14px 10px', gap: '6px' }}
        >
          {data!.agents!.map((agent, idx) => (
            <AgentPill
              key={`${agent.name}-${idx}`}
              name={agent.name}
              status={agent.status}
              runningBg={theme.agentRunningBg}
              runningColor={theme.primaryText}
            />
          ))}
        </div>
      )}

      {/* Tool activity feed */}
      {hasTools && (
        <ToolFeed
          feedRef={feedRef}
          tools={data!.recentTools!}
          activeColor={theme.primary}
          maxHeight={feedMaxHeight}
        />
      )}

      {/* Fallback */}
      {(!data || (!hasTools && !hasAgents)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          {fallbackText}
        </p>
      )}
    </div>
  );
}

// ── Agent pill ──────────────────────────────────────────────

function AgentPill({
  name,
  status,
  runningBg,
  runningColor,
}: {
  name: string;
  status: 'running' | 'completed' | 'failed';
  runningBg: string;
  runningColor: string;
}) {
  const isRunning = status === 'running';
  const isDone = status === 'completed';
  return (
    <span
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
        backgroundColor: isRunning
          ? runningBg
          : isDone
            ? 'rgba(52, 211, 153, 0.12)'
            : 'rgba(248, 113, 113, 0.12)',
        color: isRunning ? runningColor : isDone ? '#34d399' : '#f87171',
      }}
    >
      {isRunning && (
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
      {isDone && '✓'}
      {status === 'failed' && '✗'}
      {name}
    </span>
  );
}

// ── Tool activity feed ──────────────────────────────────────

function ToolFeed({
  feedRef,
  tools,
  activeColor,
  maxHeight,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  tools: PlanningToolEntry[];
  activeColor: string;
  maxHeight: number;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '6px 14px',
      }}
      className="kb-scrollbar"
    >
      {tools.map((entry, i) => (
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
              backgroundColor: entry.running ? activeColor : '#34d399',
              animation: entry.running ? 'kb-pulse 1.5s ease-in-out infinite' : undefined,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '10px', flexShrink: 0 }}>{toolIcon(entry.tool)}</span>
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
  );
}
