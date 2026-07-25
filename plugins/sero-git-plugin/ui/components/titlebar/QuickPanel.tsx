/**
 * What the titlebar popover holds: the files it is about to commit, the commit
 * box, sync, and the way into the Git app (§5).
 *
 * One bordered container, sections separated by hairlines (rule 1) — no cards,
 * no hero sentence, no stats strip. The change list scrolls at five rows, so
 * the panel is the same height with one changed file or eighty and the commit
 * button never moves. Committing only *some* of them is what the Git app is
 * for, so this commits the lot.
 *
 * Failures report where the action was invoked, in the same slot as the
 * disabled reason (rules 20 and 22). No toasts.
 */

import { useCallback, useState } from 'react';
import { ArrowUpRight, GitBranch, Loader2 } from 'lucide-react';
import { getSeroApi } from '@sero-ai/app-runtime';

import type { FileChange, GitManagerRequest } from '../../../shared/types';
import { statusColour } from '../../lib/file-status';

/** Five rows at the one row scale (rule 10). */
const LIST_MAX_HEIGHT = 5 * 26;

type ActionKind = 'commit' | 'fetch' | 'pull' | 'push';

interface Props {
  workspaceId: string;
  repoName: string;
  branchName: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  changes: FileChange[];
  onOpenGit: () => void;
}

export function QuickPanel({
  workspaceId, repoName, branchName, ahead, behind, hasRemote, changes, onOpenGit,
}: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [failure, setFailure] = useState<{ kind: ActionKind; message: string } | null>(null);

  const run = useCallback(async (kind: ActionKind, request: GitManagerRequest) => {
    const gitApp = getSeroApi().gitApp;
    if (!gitApp) {
      setFailure({ kind, message: 'Git actions are unavailable. Reload Sero.' });
      return;
    }
    setBusy(kind);
    setFailure(null);
    try {
      const result = await gitApp.run(workspaceId, request);
      if (!result.ok) {
        setFailure({ kind, message: result.message });
        return;
      }
      if (kind === 'commit') setMessage('');
    } catch (error) {
      setFailure({
        kind,
        message: error instanceof Error ? error.message : `Could not ${kind}.`,
      });
    } finally {
      setBusy(null);
    }
  }, [workspaceId]);

  const conflicts = changes.filter((file) => file.status === 'conflict').length;
  const blockedReason = conflicts > 0
    ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} left to resolve`
    : null;
  const canCommit = changes.length > 0 && message.trim().length > 0 && !blockedReason;

  const commit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Everything, staged or not — the popover has one list.
    void run('commit', { action: 'commit', all: true, message: trimmed });
  }, [message, run]);

  return (
    <div className="flex flex-col text-[var(--text-primary)]">
      {/* ── Where you are ──────────────────────────────────────── */}
      <div className="px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-1.5 text-[0.88rem] font-medium">
          <GitBranch className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate">{repoName}</span>
        </div>
        {/* Machine values are mono (rule 9). */}
        <div className="mt-0.5 truncate font-mono text-[0.75rem] text-[var(--text-muted)]">
          {branchName}{hasRemote ? ` · ↑${ahead} ↓${behind}` : ''}
        </div>
      </div>

      <Hairline />

      {/* ── What you are about to commit ───────────────────────── */}
      <div className="flex items-baseline gap-1.5 px-3 pb-1 pt-2.5">
        <span className="text-[0.78rem] font-medium tracking-wide text-[var(--text-muted)]">Changes</span>
        <span className="text-[0.78rem] text-[var(--text-muted)]/70">{changes.length}</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: LIST_MAX_HEIGHT }}>
        {changes.length === 0 ? (
          <p className="flex h-[26px] items-center px-3 text-xs text-[var(--text-muted)]">
            Nothing changed
          </p>
        ) : (
          changes.map((file) => <ChangeRow key={file.path} file={file} />)
        )}
      </div>

      {/* ── Commit ─────────────────────────────────────────────── */}
      <div className="p-3 pt-2">
        <input
          aria-label="Commit message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit();
          }}
          placeholder="Message"
          className="h-[30px] w-full rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 text-[0.85rem] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit || busy === 'commit'}
          className="mt-1.5 flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[7px] bg-[var(--brand-primary)] text-[0.83rem] font-medium text-[var(--brand-primary-foreground)] transition-colors hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'commit' && <Loader2 className="size-3.5 animate-spin" />}
          {commitLabel(changes.length)}
          <span className="font-mono text-[0.72rem] opacity-65">⌘↵</span>
        </button>
        {/* The reason sits with the control, not in a tooltip or a toast. */}
        {blockedReason && (
          <p className="mt-1 text-xs text-[var(--status-warning)]">{blockedReason}</p>
        )}
        {failure?.kind === 'commit' && <FailureNote>{failure.message}</FailureNote>}
      </div>

      <Hairline />

      {/* ── Sync ───────────────────────────────────────────────── */}
      <div className="flex gap-1.5 p-3">
        <SyncButton
          label="Fetch"
          busy={busy === 'fetch'}
          disabled={!hasRemote || busy !== null}
          onClick={() => void run('fetch', { action: 'fetch' })}
        />
        <SyncButton
          label={behind > 0 ? `Pull ${behind}` : 'Pull'}
          busy={busy === 'pull'}
          disabled={!hasRemote || busy !== null}
          onClick={() => void run('pull', { action: 'pull' })}
        />
        <SyncButton
          label={ahead > 0 ? `Push ${ahead}` : 'Push'}
          busy={busy === 'push'}
          disabled={!hasRemote || busy !== null}
          onClick={() => void run('push', { action: 'push' })}
        />
      </div>
      {!hasRemote && (
        <p className="-mt-2 px-3 pb-3 text-xs text-[var(--text-muted)]">
          This repository has no remote yet.
        </p>
      )}
      {failure && failure.kind !== 'commit' && (
        <div className="-mt-2 px-3 pb-3"><FailureNote>{failure.message}</FailureNote></div>
      )}

      <Hairline />

      <button
        type="button"
        onClick={onOpenGit}
        className="flex h-8 items-center gap-1.5 px-3 text-[0.83rem] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      >
        Open Git
        <span className="flex-1" />
        <ArrowUpRight className="size-3" />
      </button>
    </div>
  );
}

function commitLabel(count: number): string {
  if (count === 0) return 'Commit';
  return count === 1 ? 'Commit 1 file' : `Commit ${count} files`;
}

function Hairline() {
  return <div className="h-px shrink-0 bg-[var(--border-subtle)]" />;
}

function ChangeRow({ file }: { file: FileChange }) {
  const slash = file.path.lastIndexOf('/');
  const dir = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const name = slash === -1 ? file.path : file.path.slice(slash + 1);

  return (
    <div className="flex h-[26px] items-center gap-2 px-3" title={file.path}>
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: statusColour(file.status) }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
        {name}
      </span>
    </div>
  );
}

function SyncButton({
  label, busy, disabled, onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border-subtle)] text-[0.83rem] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {label}
    </button>
  );
}

function FailureNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-[var(--status-error)]">{children}</p>;
}
