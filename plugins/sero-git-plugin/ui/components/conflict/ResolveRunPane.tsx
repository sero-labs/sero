/**
 * The account of what the AI resolver did, and the one thing that needs you.
 *
 * One line per conflict — what it changed and why — so when it stops, you
 * already know what it did to get there. The account stays on screen after the
 * run finishes, and every line jumps to its file, so it doubles as a review
 * checklist.
 *
 * **The question is the only thing that needs you**, and it comes with the
 * actual options rather than "please resolve manually" (§7).
 */

import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react';
import type { ConflictQuestionOption } from '../../store/sero-bridge';
import type { RunEntry, RunStatus } from '../../store/conflict-run';

interface Props {
  status: RunStatus;
  entries: RunEntry[];
  onAnswer: (entryId: string, option: ConflictQuestionOption) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  /** Each line is clickable and opens its file in the resolver. */
  onSelectFile: (path: string) => void;
}

export function ResolveRunPane({
  status, entries, onAnswer, onPause, onResume, onStop, onSelectFile,
}: Props) {
  const done = entries.filter((entry) => entry.state === 'done').length;
  const running = status === 'running' || status === 'paused';
  const finished = status === 'finished' || status === 'stopped';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-8 shrink-0 items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-[0.84rem] ${
        finished ? 'text-[var(--status-success)]' : 'text-[var(--text-secondary)]'
      }`}>
        {finished
          ? <Check className="size-3.5 shrink-0" />
          : <Sparkles className="size-3.5 shrink-0" />}
        <span className="truncate">{headline(status, done, entries.length)}</span>
        <span className="flex-1" />
        {running && (
          <>
            <BarButton onClick={status === 'paused' ? onResume : onPause}>
              {status === 'paused' ? 'Resume' : 'Pause'}
            </BarButton>
            <BarButton onClick={onStop}>Stop</BarButton>
          </>
        )}
        {finished && entries.length > 0 && (
          <BarButton onClick={() => void copySummary(entries)}>Copy summary</BarButton>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto git-scrollbar py-1">
        {entries.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Reading the conflicted files…</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id}>
              <LogRow entry={entry} onSelect={() => onSelectFile(entry.path)} />
              {/* Only while it is still being asked. Once answered the line
                  itself says what you chose, and the box has served its turn. */}
              {entry.state === 'asked' && entry.question && (
                <QuestionBox
                  question={entry.question}
                  onChoose={(option) => onAnswer(entry.id, option)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function headline(status: RunStatus, done: number, total: number): string {
  if (status === 'paused') return 'Paused';
  if (status === 'stopped') return `Stopped — ${done} of ${total} resolved, and kept`;
  if (status === 'finished') {
    return done === total
      ? `${done} conflict${done === 1 ? '' : 's'} resolved`
      : `${done} of ${total} resolved — the rest still need you`;
  }
  return 'Resolving conflicts';
}

function LogRow({ entry, onSelect }: { entry: RunEntry; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-baseline gap-2 px-3 py-[3px] text-left hover:bg-[var(--bg-elevated)]"
    >
      <span className="relative top-[2px] shrink-0">
        <StateIcon state={entry.state} />
      </span>
      <span className="shrink-0 text-[0.84rem] text-[var(--text-secondary)] git-mono">
        {fileName(entry.path)}
        {entry.conflictNumber > 0 && <span className="text-[var(--text-muted)]"> · {entry.conflictNumber}</span>}
      </span>
      <span className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
        {entry.why ?? queuedLabel(entry.state)}
      </span>
    </button>
  );
}

function StateIcon({ state }: { state: RunEntry['state'] }) {
  if (state === 'done') return <Check className="size-3 text-[var(--status-success)]" />;
  if (state === 'working') return <Loader2 className="size-3 animate-spin text-[var(--text-muted)]" />;
  if (state === 'asked') return <AlertCircle className="size-3 text-[var(--status-warning)]" />;
  if (state === 'declined') return <AlertCircle className="size-3 text-[var(--text-muted)]" />;
  if (state === 'failed') return <AlertCircle className="size-3 text-[var(--status-error)]" />;
  return <span className="block size-3 rounded-full border border-[var(--border-default)]" />;
}

function queuedLabel(state: RunEntry['state']): string {
  if (state === 'working') return 'working on it';
  if (state === 'asked') return 'needs an answer';
  return 'queued';
}

/**
 * The real options, with their actual values. An option with nothing to write
 * is the "let me edit it" escape — it leaves the markers alone and the manual
 * resolver takes over.
 */
function QuestionBox({
  question, onChoose,
}: {
  question: NonNullable<RunEntry['question']>;
  onChoose: (option: ConflictQuestionOption) => void;
}) {
  return (
    <div className="mx-3 my-1.5 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] p-2.5">
      <p className="text-[0.84rem] text-[var(--text-primary)]">{question.question}</p>
      {question.because && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{question.because}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {question.options.map((option) => (
          <button
            key={`${option.label}:${option.detail}`}
            type="button"
            onClick={() => onChoose(option)}
            className="flex items-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-left hover:bg-[var(--bg-elevated)]"
          >
            <span className="text-[0.84rem] text-[var(--text-primary)] git-mono">{option.label}</span>
            {option.detail && (
              <span className="text-xs text-[var(--text-muted)]">{option.detail}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function BarButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function fileName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

/** The same account, as text — for a PR description, or for asking someone. */
async function copySummary(entries: RunEntry[]): Promise<void> {
  const text = entries
    .filter((entry) => entry.why)
    .map((entry) => `- ${entry.path} · ${entry.conflictNumber}: ${entry.why}`)
    .join('\n');
  await navigator.clipboard.writeText(text).catch(() => {});
}
