/**
 * Inline actions on Agent Board cards — the "resolve it right here" part.
 * Renders and routes the orchestrator's existing durable actions (answer a
 * question, approve a gate or suggestion, retry, run again, activate, start
 * work on an issue). No second approval layer: the board only forwards.
 */

import { useState, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CornerDownLeft, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import type { OrchestratorBoardAction } from '@sero-ai/common';
import { openSeroApp } from '@sero-ai/app-runtime';
import { ORCHESTRATOR_APP_ID } from '@sero-ai/common';
import { useAgentBoardStore } from '@/stores/agent-board';
import type { BoardIssueCard, BoardLoopCard } from './board-model';

interface BoardCardActionsProps {
  card: BoardLoopCard | BoardIssueCard;
}

export function BoardCardActions({ card }: BoardCardActionsProps) {
  const requestAction = useAgentBoardStore((s) => s.requestAction);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState('');

  async function run(action: OrchestratorBoardAction, e?: MouseEvent): Promise<void> {
    e?.stopPropagation();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestAction(card.workspaceId, action);
      if (!result.ok) {
        setError(result.error ?? 'Action failed');
      } else if (action.kind === 'fire_event') {
        setNotice(
          result.delivered
            ? `Sent to ${result.delivered} loop${result.delivered === 1 ? '' : 's'}`
            : 'No loop is listening — install the issue-implementer loop in Orchestrator',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const body = card.kind === 'issue'
    ? renderIssueActions(card, pending, run)
    : renderLoopActions(card, pending, text, setText, run);
  if (!body) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {body}
      <AnimatePresence>
        {(error ?? notice) && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`text-sm ${error ? 'text-status-error' : 'text-[var(--text-muted)]'}`}
          >
            {error ?? notice}
            {notice?.includes('issue-implementer') && (
              <button
                type="button"
                className="ml-1 underline hover:text-[var(--text-primary)]"
                onClick={() => void openSeroApp(ORCHESTRATOR_APP_ID)}
              >
                Open Orchestrator
              </button>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Loop attention / lifecycle actions ──────────────────────

type RunFn = (action: OrchestratorBoardAction, e?: MouseEvent) => Promise<void>;

function renderLoopActions(
  card: BoardLoopCard,
  pending: boolean,
  text: string,
  setText: (value: string) => void,
  run: RunFn,
) {
  const { loop } = card;
  const input = loop.attention?.input;
  const question = input?.questions[0];

  if (input && question) {
    const answer = (choiceId?: string, freeText?: string, e?: MouseEvent) =>
      run(
        {
          kind: 'answer_input',
          loopId: loop.id,
          requestId: input.requestId,
          answers: [{ questionId: question.id, choiceId, text: freeText }],
        },
        e,
      );

    return (
      <div className="flex flex-col gap-1.5 rounded-md bg-[var(--bg-elevated)]/60 p-2">
        <p className="text-sm leading-snug text-[var(--text-secondary)]">{question.prompt}</p>
        {question.kind === 'approval' ? (
          <div className="flex gap-1.5">
            <ActionButton
              tone="success"
              disabled={pending}
              onClick={(e) => void answer('approve', undefined, e)}
            >
              <Check className="size-3" /> Approve
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={pending}
              onClick={(e) => void answer('reject', undefined, e)}
            >
              <X className="size-3" /> Reject
            </ActionButton>
          </div>
        ) : question.choices?.length ? (
          <div className="flex flex-wrap gap-1">
            {question.choices.map((choice) => (
              <ActionButton
                key={choice.id}
                tone="neutral"
                disabled={pending}
                onClick={(e) => void answer(choice.id, undefined, e)}
              >
                {choice.label}
              </ActionButton>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim()) void answer(undefined, text.trim());
              }}
              placeholder="Answer…"
              className="h-6 min-w-0 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
            />
            <ActionButton
              tone="neutral"
              disabled={pending || !text.trim()}
              onClick={(e) => void answer(undefined, text.trim(), e)}
            >
              <CornerDownLeft className="size-3" />
            </ActionButton>
          </div>
        )}
      </div>
    );
  }

  const suggestion = loop.attention?.suggestions?.[0];
  if (suggestion) {
    return (
      <div className="flex flex-col gap-1.5 rounded-md bg-[var(--bg-elevated)]/60 p-2">
        <p className="flex items-start gap-1 text-sm leading-snug text-[var(--text-secondary)]">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-status-info" />
          {suggestion.rationale}
        </p>
        <div className="flex gap-1.5">
          <ActionButton
            tone="success"
            disabled={pending}
            onClick={(e) =>
              void run(
                { kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'approve' },
                e,
              )
            }
          >
            <Check className="size-3" /> Apply
          </ActionButton>
          <ActionButton
            tone="neutral"
            disabled={pending}
            onClick={(e) =>
              void run(
                { kind: 'choose_suggestion', loopId: loop.id, suggestionId: suggestion.id, decision: 'reject' },
                e,
              )
            }
          >
            Dismiss
          </ActionButton>
        </div>
      </div>
    );
  }

  if (loop.status === 'blocked') {
    return (
      <div className="flex gap-1.5">
        <ActionButton tone="neutral" disabled={pending} onClick={(e) => void run({ kind: 'retry', loopId: loop.id }, e)}>
          <RotateCcw className="size-3" /> Retry
        </ActionButton>
        <ActionButton tone="neutral" disabled={pending} onClick={(e) => void run({ kind: 'run_again', loopId: loop.id }, e)}>
          <Play className="size-3" /> Run again
        </ActionButton>
      </div>
    );
  }

  if (loop.status === 'draft') {
    return (
      <div className="flex gap-1.5">
        <ActionButton tone="success" disabled={pending} onClick={(e) => void run({ kind: 'activate', loopId: loop.id }, e)}>
          <Play className="size-3" /> Activate
        </ActionButton>
      </div>
    );
  }

  return null;
}

// ── Issue actions (backlog) ─────────────────────────────────

function renderIssueActions(card: BoardIssueCard, pending: boolean, run: RunFn) {
  const { issue } = card;
  return (
    <div className="flex gap-1.5">
      <ActionButton
        tone="success"
        disabled={pending}
        onClick={(e) =>
          void run(
            {
              kind: 'fire_event',
              event: {
                id: crypto.randomUUID(),
                source: 'github:issue-opened',
                payload: {
                  number: issue.number,
                  title: issue.title,
                  url: issue.url,
                  labels: issue.labels,
                },
                occurredAt: new Date().toISOString(),
                summary: `Start work on issue #${issue.number}: ${issue.title}`,
              },
            },
            e,
          )
        }
      >
        <Play className="size-3" /> Start work
      </ActionButton>
    </div>
  );
}

// ── Tiny styled button ──────────────────────────────────────

function ActionButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: 'success' | 'danger' | 'neutral';
  disabled?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-status-success-muted text-status-success hover:bg-status-success-subtle'
      : tone === 'danger'
        ? 'bg-status-error-muted text-status-error hover:bg-status-error-subtle'
        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]';
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-sm font-medium transition-colors disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </motion.button>
  );
}
