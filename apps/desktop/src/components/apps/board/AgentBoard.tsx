/**
 * Agent Board — profile-wide kanban of all agent work across workspaces
 * (docs/features/agent-board/plan.md). Four columns: Backlog · Active ·
 * Needs Attention · Finished. Reads are push-only (watched files + agent
 * events); the columns recompute on state change, never on a timer.
 */

import { memo, useEffect, useMemo } from 'react';
import { domMax, LazyMotion, LayoutGroup, m } from 'motion/react';
import { Columns3, RefreshCw } from 'lucide-react';
import { useAgentBoardStore } from '@/stores/agent-board';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useStreamingSessionIds } from '@/stores/agent-selectors';
import { useAgentStore } from '@/stores/agent';
import {
  buildBoardColumns,
  type BoardSession,
  type BoardWorkspace,
} from './board-model';
import { BoardColumn } from './BoardColumn';
import { COLUMN_ORDER } from './board-constants';

export const AgentBoard = memo(function AgentBoard() {
  const start = useAgentBoardStore((s) => s.start);
  const slices = useAgentBoardStore((s) => s.slices);
  const collapsedColumns = useAgentBoardStore((s) => s.collapsedColumns);
  const workspaceFilter = useAgentBoardStore((s) => s.workspaceFilter);
  const setWorkspaceFilter = useAgentBoardStore((s) => s.setWorkspaceFilter);
  const refreshIssues = useAgentBoardStore((s) => s.refreshIssues);
  const refreshingIssues = useAgentBoardStore((s) => s.refreshingIssues);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const sessions = useSessionStore((s) => s.sessions);
  const streamingSessionIds = useStreamingSessionIds();
  const agents = useAgentStore((s) => s.agents);

  useEffect(() => {
    start();
  }, [start]);

  const boardWorkspaces = useMemo<BoardWorkspace[]>(
    () =>
      workspaces.flatMap((workspace) =>
        workspace.path && (!workspaceFilter || workspace.id === workspaceFilter)
          ? [{ id: workspace.id, name: workspace.name, path: workspace.path }]
          : [],
      ),
    [workspaces, workspaceFilter],
  );

  const liveSessions = useMemo<BoardSession[]>(() => {
    return streamingSessionIds.map((sessionId) => {
      const agent = agents[sessionId];
      const info = sessions.find((s) => s.id === sessionId);
      return {
        sessionId,
        workspaceId: agent?.workspaceId ?? info?.workspaceId ?? 'global',
        title: info?.name ?? info?.firstMessage ?? 'Live session',
        streaming: true,
      };
    });
  }, [streamingSessionIds, agents, sessions]);

  // No timers on the board: the clock advances only when board data changes,
  // which is exactly when ages can change meaning. A stable value between data
  // changes also keeps the memoized columns/cards from re-rendering for free.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- data deps deliberately drive the clock
  const nowMs = useMemo(() => Date.now(), [boardWorkspaces, slices, liveSessions]);

  const columns = useMemo(
    () => buildBoardColumns(boardWorkspaces, slices, liveSessions, nowMs),
    [boardWorkspaces, slices, liveSessions, nowMs],
  );

  const runningCount = columns.active.length;
  const attentionCount = columns.attention.length;

  return (
    <LazyMotion features={domMax}>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Ambient top glow — brand-tinted, purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, var(--brand-primary-faint) 0%, transparent 100%)',
        }}
      />

      <header className="relative z-10 flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
        <m.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex items-center gap-2.5"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
            <Columns3 className="size-4.5" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
              Agent Board
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              {runningCount > 0 ? `${runningCount} running` : 'Nothing running'}
              {attentionCount > 0 ? ` · ${attentionCount} need${attentionCount === 1 ? 's' : ''} you` : ''}
            </p>
          </div>
        </m.div>

        <div className="ml-auto flex items-center gap-1.5">
          <WorkspaceFilterChips
            workspaces={workspaces.flatMap((workspace) =>
              workspace.path ? [{ id: workspace.id, name: workspace.name }] : [],
            )}
            selected={workspaceFilter}
            onSelect={setWorkspaceFilter}
          />
          <button
            type="button"
            onClick={() => void refreshIssues()}
            title="Refresh GitHub issues and pull requests"
            className="flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className={`size-3.5 ${refreshingIssues ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="relative z-10 min-h-0 flex-1 overflow-x-auto px-4 pb-4">
        <LayoutGroup>
          <div className="grid h-full min-w-[880px] grid-cols-4 gap-3">
            {COLUMN_ORDER.map((columnId, index) => (
              <BoardColumn
                key={columnId}
                columnId={columnId}
                cards={columns[columnId]}
                collapsed={collapsedColumns.includes(columnId)}
                index={index}
                nowMs={nowMs}
              />
            ))}
          </div>
        </LayoutGroup>
      </div>
      </div>
    </LazyMotion>
  );
});

interface WorkspaceFilterChipsProps {
  workspaces: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

function WorkspaceFilterChips({ workspaces, selected, onSelect }: WorkspaceFilterChipsProps) {
  if (workspaces.length < 2) return null;
  const chips: { id: string | null; name: string }[] = [
    { id: null, name: 'All' },
    ...workspaces,
  ];
  return (
    <div className="flex max-w-[40vw] items-center gap-1 overflow-x-auto">
      {chips.map((chip) => {
        const active = selected === chip.id;
        return (
          <button
            key={chip.id ?? 'all'}
            type="button"
            onClick={() => onSelect(chip.id)}
            className={`relative shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {active && (
              <m.span
                layoutId="board-filter-pill"
                className="absolute inset-0 rounded-full bg-[var(--bg-overlay)] ring-1 ring-[var(--border-default)]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{chip.name}</span>
          </button>
        );
      })}
    </div>
  );
}
