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
import { NarrativeFeed, ToolFeed } from './ActivityPanelFeeds';
import { PhaseLiveOutputPreview } from './PhaseLiveOutputPreview';

const TOOL_LOG_PATTERN = /^\s*(\S+)\s+([a-z_][a-z0-9_]*):\s*(.+)$/;
const PROMPT_ECHO_PATTERN = /^\s*(?:\S+\s+){0,2}(?:#+\s*)?(Card|Parent Card|Subtask):/i;
const MARKDOWN_HEADING_PATTERN = /^\s*(?:>\s*)?#{1,6}\s+\S/;
const VALID_TOOL_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;
const HIDDEN_PROMPT_TOOL_NAMES = new Set(['card']);
const HIDDEN_TOOL_NAMES = new Set(['kanban_mark_subtask_complete']);

function formatElapsed(startedAt: number): string {
  const ms = Date.now() - startedAt;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  return `${Math.round(ms / 1000)}s`;
}

export interface ActivityPanelTheme {
  primary: string;
  primaryText: string;
  border: string;
  background: string;
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
  defaultPhase: string;
  fallbackText: string;
  headerSlot?: React.ReactNode;
  headerExtra?: React.ReactNode;
  feedMaxHeight?: number;
  showLogFeed?: boolean;
  logFeedMaxHeight?: number;
}

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

  const startedAt = data?.startedAt;

  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const tick = () => setElapsed(formatElapsed(startedAt));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

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

      <div className="flex items-center" style={{ padding: '12px 14px', gap: '10px' }}>
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

      {hasTools && (
        <ToolFeed
          feedRef={feedRef}
          tools={visibleTools}
          activeColor={theme.primary}
          maxHeight={feedMaxHeight}
          separated={hasLiveOutput || hasNarrativeEntries}
        />
      )}

      {(!data || (!hasTools && !hasNarrativeEntries && !hasLiveOutput)) && (
        <p style={{ fontSize: '11px', color: '#5c5e6a', lineHeight: 1.4, padding: '0 14px 12px' }}>
          {fallbackText}
        </p>
      )}
    </div>
  );
}

function isPromptEchoText(text: string): boolean {
  const trimmed = text.trim();
  return PROMPT_ECHO_PATTERN.test(trimmed) || MARKDOWN_HEADING_PATTERN.test(trimmed);
}
