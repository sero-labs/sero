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
import { formatActivityLogLine } from './activity-panel-log';
import { PhaseLiveOutputPreview } from './PhaseLiveOutputPreview';

// ── Tool icons ──────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  read: '📖', bash: '📂', write: '✏️', edit: '✏️',
  ls: '📁', find: '🔍', grep: '🔎', glob: '🔍',
};
const TOOL_LOG_PATTERN = /^\s*(\S+)\s+([a-z_][a-z0-9_]*):\s*(.+)$/;
const PROMPT_ECHO_PATTERN = /^\s*(?:\S+\s+){0,2}(?:#+\s*)?(Card|Parent Card|Subtask):/i;
const MARKDOWN_HEADING_PATTERN = /^\s*(?:>\s*)?#{1,6}\s+\S/;
const VALID_TOOL_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;
const HIDDEN_PROMPT_TOOL_NAMES = new Set(['card']);
const HIDDEN_TOOL_NAMES = new Set(['kanban_mark_subtask_complete']);

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
  log?: string[];
  liveOutput?: string;
  liveOutputSource?: string;
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
  /** Render textual status updates from `data.log`. */
  showLogFeed?: boolean;
  /** Max height for the text update feed. Default: 120. */
  logFeedMaxHeight?: number;
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
  showLogFeed = false,
  logFeedMaxHeight = 120,
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
  const latestTool = data?.recentTools?.[data.recentTools.length - 1];
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [data?.recentTools?.length, latestTool?.tool, latestTool?.args, latestTool?.running]);

  const logFeedRef = useRef<HTMLDivElement>(null);
  const narrativeEntries = showLogFeed
    ? (data?.log ?? []).filter((entry) => {
      const trimmed = entry.trim();
      return trimmed && !TOOL_LOG_PATTERN.test(trimmed) && !isPromptEchoText(trimmed);
    })
    : [];
  const latestNarrativeEntry = narrativeEntries[narrativeEntries.length - 1];

  useEffect(() => {
    if (logFeedRef.current) {
      logFeedRef.current.scrollTop = logFeedRef.current.scrollHeight;
    }
  }, [narrativeEntries.length, latestNarrativeEntry]);

  const visibleTools = (data?.recentTools ?? []).filter((entry) => (
    !HIDDEN_TOOL_NAMES.has(entry.tool)
    && !HIDDEN_PROMPT_TOOL_NAMES.has(entry.tool)
    && VALID_TOOL_NAME_PATTERN.test(entry.tool)
    && !isPromptEchoText(entry.args)
  ));
  const hasTools = visibleTools.length > 0;
  const hasNarrativeEntries = narrativeEntries.length > 0;
  const hasLiveOutput = !!data?.liveOutput?.trim();

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

      {hasLiveOutput && (
        <PhaseLiveOutputPreview
          source={data?.liveOutputSource}
          text={data?.liveOutput}
          theme={theme}
        />
      )}

      {hasNarrativeEntries && (
        <NarrativeFeed
          feedRef={logFeedRef}
          entries={narrativeEntries}
          theme={theme}
          maxHeight={logFeedMaxHeight}
          separated={hasLiveOutput}
        />
      )}

      {/* Tool activity feed */}
      {hasTools && (
        <ToolFeed
          feedRef={feedRef}
          tools={visibleTools}
          activeColor={theme.primary}
          maxHeight={feedMaxHeight}
          separated={hasLiveOutput || hasNarrativeEntries}
        />
      )}

      {/* Fallback */}
      {(!data || (!hasTools && !hasNarrativeEntries && !hasLiveOutput)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          {fallbackText}
        </p>
      )}
    </div>
  );
}

// ── Tool activity feed ──────────────────────────────────────

function ToolFeed({
  feedRef,
  tools,
  activeColor,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  tools: PlanningToolEntry[];
  activeColor: string;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 6px' : '6px 14px',
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

// ── Narrative status feed ───────────────────────────────────

function NarrativeFeed({
  feedRef,
  entries,
  theme,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  entries: string[];
  theme: ActivityPanelTheme;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 4px' : '8px 14px 2px',
      }}
      className="kb-scrollbar"
    >
      {entries.map((entry, i) => (
        <NarrativeEntry
          key={`${entry}-${i}`}
          entry={entry}
          theme={theme}
        />
      ))}
    </div>
  );
}

function NarrativeEntry({
  entry,
  theme,
}: {
  entry: string;
  theme: ActivityPanelTheme;
}) {
  const formattedEntry = formatActivityLogLine(entry);
  const tone = resolveLogTone(formattedEntry);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '0 0 6px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: tone === 'running'
            ? theme.primary
            : tone === 'success'
              ? '#34d399'
              : tone === 'error'
                ? '#f87171'
                : tone === 'warning'
                  ? '#f59e0b'
                  : 'rgba(255, 255, 255, 0.18)',
          animation: tone === 'running' ? 'kb-pulse 1.8s ease-in-out infinite' : undefined,
          flexShrink: 0,
          marginTop: '4px',
        }}
      />
      <p
        className="whitespace-pre-wrap break-words"
        style={{
          fontSize: '10px',
          lineHeight: 1.45,
          color: tone === 'success'
            ? '#86efac'
            : tone === 'error'
              ? '#fca5a5'
              : tone === 'warning'
                ? '#fcd34d'
                : tone === 'running'
                  ? theme.primaryText
                  : '#8b8d97',
          minWidth: 0,
        }}
      >
        {formattedEntry}
      </p>
    </div>
  );
}

function resolveLogTone(entry: string): 'running' | 'success' | 'error' | 'warning' | 'neutral' {
  if (entry.startsWith('🔄')) return 'running';
  if (entry.startsWith('✅')) return 'success';
  if (entry.startsWith('❌')) return 'error';
  if (entry.startsWith('⚠️')) return 'warning';
  return 'neutral';
}

function isPromptEchoText(text: string): boolean {
  const trimmed = text.trim();
  return PROMPT_ECHO_PATTERN.test(trimmed) || MARKDOWN_HEADING_PATTERN.test(trimmed);
}
