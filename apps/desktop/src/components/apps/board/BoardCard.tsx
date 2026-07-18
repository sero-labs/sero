/**
 * One Agent Board card. A card is a unit of work: an orchestrator loop, an
 * unclaimed GitHub issue (backlog), or a live interactive session. Everything
 * shown is derived from durable state; the animations are the only decoration.
 */

import { memo, useEffect } from 'react';
import { motion } from 'motion/react';
import { openSeroApp } from '@sero-ai/app-runtime';
import { ORCHESTRATOR_APP_ID } from '@sero-ai/common';
import {
  ArrowDown,
  ArrowUp,
  CircleDot,
  GitBranch,
  GitPullRequest,
  MessageSquare,
} from 'lucide-react';
import { useAgentBoardStore } from '@/stores/agent-board';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import type { BoardColumnId } from '@/types/board';
import {
  formatAge,
  formatCost,
  formatTokens,
  formatUntil,
  type BoardCard as BoardCardModel,
  type BoardIssueCard,
  type BoardLoopCard,
  type BoardSessionCard,
} from './board-model';
import { BoardCardActions } from './BoardCardActions';

const COLUMN_ACCENT: Record<BoardColumnId, string> = {
  backlog: 'var(--text-muted)',
  active: 'var(--status-success)',
  attention: 'var(--status-warning)',
  done: 'var(--status-info)',
};

const CARD_SPRING = { type: 'spring', stiffness: 400, damping: 32 } as const;

interface BoardCardProps {
  card: BoardCardModel;
  columnId: BoardColumnId;
  nowMs: number;
}

export const BoardCard = memo(function BoardCard({ card, columnId, nowMs }: BoardCardProps) {
  return (
    <motion.article
      layout
      layoutId={card.key}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={CARD_SPRING}
      whileHover={{ y: -2 }}
      className={`group relative shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-[var(--bg-surface)] shadow-sm transition-shadow hover:shadow-md ${
        columnId === 'attention'
          ? 'border-status-warning-border bg-status-warning-faint'
          : 'border-[var(--border-subtle)]'
      }`}
      onClick={() => openCard(card)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: COLUMN_ACCENT[columnId] }}
      />
      <div className="flex flex-col gap-1.5 py-2.5 pl-3.5 pr-3">
        {card.kind === 'loop' && <LoopCardBody card={card} columnId={columnId} nowMs={nowMs} />}
        {card.kind === 'issue' && <IssueCardBody card={card} nowMs={nowMs} />}
        {card.kind === 'session' && <SessionCardBody card={card} />}
      </div>
    </motion.article>
  );
});

// ── Loop cards ──────────────────────────────────────────────

function LoopCardBody({
  card,
  columnId,
  nowMs,
}: {
  card: BoardLoopCard;
  columnId: BoardColumnId;
  nowMs: number;
}) {
  const { loop } = card;
  const running = Boolean(loop.progress?.running);

  return (
    <>
      <div className="flex items-start gap-2">
        {running ? <PulsingDot tone="var(--status-success)" /> : null}
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-[var(--text-primary)]">
          {loop.title}
        </h3>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
          {formatAge(loop.updatedAt, nowMs)}
        </span>
      </div>

      <WorkspaceLine name={card.workspaceName} branch={loop.branchName} />

      {running && loop.activeStepTitles?.length ? (
        <ActivityLine titles={loop.activeStepTitles} />
      ) : null}
      {running && loop.progress ? (
        <ProgressBar done={loop.progress.done} total={loop.progress.total} />
      ) : null}

      {card.queuedReason && columnId === 'backlog' ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          {card.queuedReason === 'draft' && 'Draft — not yet activated'}
          {card.queuedReason === 'scheduled' && `Next run ${formatUntil(card.queuedAt, nowMs)}`}
          {card.queuedReason === 'snoozed' && `Snoozed — retries ${formatUntil(card.queuedAt, nowMs)}`}
        </p>
      ) : null}

      {columnId === 'attention' ? <BoardCardActions card={card} /> : null}

      <ChipRow card={card} />
    </>
  );
}

/** Bottom chips: model · tokens · cost · diffstat · PRs · issues. */
function ChipRow({ card }: { card: BoardLoopCard }) {
  const { loop } = card;
  const fetchDiffStat = useAgentBoardStore((s) => s.fetchDiffStat);
  const diffStat = useAgentBoardStore((s) =>
    loop.checkoutPath ? s.diffStats[loop.checkoutPath]?.stat : undefined,
  );

  useEffect(() => {
    if (loop.checkoutPath) fetchDiffStat(loop.checkoutPath, loop.updatedAt);
  }, [loop.checkoutPath, loop.updatedAt, fetchDiffStat]);

  const usage = loop.usage;
  const hasChips =
    loop.lastModel || usage?.inputTokens || usage?.outputTokens || usage?.costUsd
    || diffStat?.additions || diffStat?.deletions
    || loop.pullRequests?.length || card.issueNumbers.length;
  if (!hasChips) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[10px] text-[var(--text-muted)]">
      {loop.lastModel && (
        <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)]">
          {shortModel(loop.lastModel)}
        </span>
      )}
      {usage?.inputTokens ? (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <ArrowUp className="size-2.5" />
          {formatTokens(usage.inputTokens)}
        </span>
      ) : null}
      {usage?.outputTokens ? (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <ArrowDown className="size-2.5" />
          {formatTokens(usage.outputTokens)}
        </span>
      ) : null}
      {usage?.costUsd ? <span className="tabular-nums">{formatCost(usage.costUsd)}</span> : null}
      {diffStat && (diffStat.additions > 0 || diffStat.deletions > 0) ? (
        <span className="tabular-nums">
          <span className="text-status-success">+{diffStat.additions}</span>{' '}
          <span className="text-status-error">−{diffStat.deletions}</span>
        </span>
      ) : null}
      {(loop.pullRequests ?? []).map((pr) => (
        <button
          key={pr.number}
          type="button"
          title={pr.title}
          onClick={(e) => {
            e.stopPropagation();
            void window.sero.shell.openExternal(pr.url);
          }}
          className="inline-flex items-center gap-0.5 rounded bg-status-info-muted px-1.5 py-0.5 font-medium text-status-info transition-colors hover:bg-status-info-subtle"
        >
          <GitPullRequest className="size-2.5" />#{pr.number}
        </button>
      ))}
      {card.issueNumbers.map((n) => (
        <span
          key={n}
          className="inline-flex items-center gap-0.5 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-medium"
        >
          <CircleDot className="size-2.5" />#{n}
        </span>
      ))}
    </div>
  );
}

// ── Issue cards (backlog) ───────────────────────────────────

function IssueCardBody({ card, nowMs }: { card: BoardIssueCard; nowMs: number }) {
  const { issue } = card;
  return (
    <>
      <div className="flex items-start gap-2">
        <CircleDot className="mt-0.5 size-3.5 shrink-0 text-status-success" />
        <h3 className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-[var(--text-primary)]">
          <span className="mr-1 text-[var(--text-muted)]">#{issue.number}</span>
          {issue.title}
        </h3>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
          {formatAge(issue.updatedAt, nowMs)}
        </span>
      </div>
      <WorkspaceLine name={card.workspaceName} />
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 4).map((label) => (
            <span
              key={label}
              className="rounded-full bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <BoardCardActions card={card} />
    </>
  );
}

// ── Live session cards ──────────────────────────────────────

function SessionCardBody({ card }: { card: BoardSessionCard }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <PulsingDot tone="var(--status-success)" />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-[var(--text-primary)]">
          {card.title}
        </h3>
        <MessageSquare className="size-3.5 shrink-0 text-[var(--text-muted)]" />
      </div>
      <WorkspaceLine name={card.workspaceName} />
      <p className="text-[11px] text-status-success">Live session — responding…</p>
    </>
  );
}

// ── Shared bits ─────────────────────────────────────────────

function WorkspaceLine({ name, branch }: { name: string; branch?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
      <span className="truncate">{name}</span>
      {branch && (
        <span className="inline-flex min-w-0 items-center gap-0.5 truncate font-mono text-[10px]">
          <GitBranch className="size-2.5 shrink-0" />
          <span className="truncate">{branch}</span>
        </span>
      )}
    </div>
  );
}

/** Soft-pulsing status dot for anything currently running. */
function PulsingDot({ tone }: { tone: string }) {
  return (
    <span className="relative mt-1 flex size-2 shrink-0">
      <motion.span
        aria-hidden
        className="absolute inline-flex h-full w-full rounded-full"
        style={{ background: tone }}
        animate={{ scale: [1, 2.1], opacity: [0.5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
      />
      <span className="relative inline-flex size-2 rounded-full" style={{ background: tone }} />
    </span>
  );
}

/** The live activity line — running step titles with a shimmering sweep. */
function ActivityLine({ titles }: { titles: string[] }) {
  const label = titles.length > 1 ? `${titles[0]} +${titles.length - 1} more` : titles[0];
  return (
    <div className="relative overflow-hidden rounded-md bg-status-success-faint px-2 py-1">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-16"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--status-success-muted), transparent)',
        }}
        animate={{ x: ['-4rem', '18rem'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
      />
      <span className="relative truncate text-[11px] text-status-success">{label}</span>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <motion.div
          className="h-full rounded-full bg-status-success"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
        {done}/{total}
      </span>
    </div>
  );
}

/** "claude-sonnet-5" → "sonnet-5"; keeps unknown ids intact. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

// ── Drilldown ───────────────────────────────────────────────

/** Clicking a card lands the user where the work actually lives. */
function openCard(card: BoardCardModel): void {
  useWorkspaceStore.getState().setActiveWorkspace(card.workspaceId);
  if (card.kind === 'loop') {
    void openSeroApp(ORCHESTRATOR_APP_ID, { loopId: card.loop.id });
    return;
  }
  if (card.kind === 'issue') {
    void window.sero.shell.openExternal(card.issue.url);
    return;
  }
  const info = useSessionStore.getState().sessions.find((s) => s.id === card.sessionId);
  if (info) {
    void useAgentStore.getState().openSession(info.id, info.path, info.workspaceId);
    useAppStore.getState().setChatPanelOpen(true);
  }
}
