/**
 * The Git app's small presentational pieces: the diff pane's header, the
 * transient action notice, and the two states that replace the app entirely
 * (a workspace still loading, and a folder that is not a repository).
 *
 * Split out of GitApp so the app file stays about composition and state.
 */

import type { DiffSelection } from '../diff/DiffPane';
import { diffContextLabel } from '../../lib/action-copy';
import type { GitActionNoticeState } from '../../store/use-git-actions';

export function DiffPaneHeader({
  selection,
  onClose,
}: {
  selection: DiffSelection;
  onClose: () => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
      <span className="truncate text-xs text-[var(--text-primary)] git-mono">
        {selection.kind === 'commit' ? 'Commit' : selection.path}
      </span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{diffContextLabel(selection)}</span>
      <span className="flex-1" />
      <button type="button"
        aria-label="Close diff"
        onClick={onClose}
        className="cursor-pointer p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  );
}

export function GitActionNotice({
  notice,
  onClose,
}: {
  notice: GitActionNoticeState;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto w-full rounded-lg border border-[var(--status-error)]/30 bg-[var(--bg-surface)] shadow-2xl shadow-black/30 backdrop-blur-sm">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 shrink-0 rounded-full bg-[var(--status-error)]/12 p-1 text-[var(--status-error)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 3.2v3.2" />
            <path d="M6 8.8h.01" />
            <circle cx="6" cy="6" r="4.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-[var(--text-primary)]">{notice.title}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">
            {notice.message}
          </div>
        </div>
        <button type="button"
          onClick={onClose}
          className="shrink-0 p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="Dismiss git action notice"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function WorkspaceLoadingState({ workspacePath }: { workspacePath: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-16 animate-pulse items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--brand-secondary)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3v12a3 3 0 003 3h0a3 3 0 003-3V9" />
            <circle cx="9" cy="3" r="2" />
            <circle cx="15" cy="9" r="2" />
            <circle cx="12" cy="21" r="2" />
          </svg>
        </div>
        <h2 className="text-base font-medium text-[var(--text-primary)]">Loading repository</h2>
        <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
          Syncing Git state for <span className="git-mono text-[var(--text-primary)]">{workspacePath}</span>.
        </p>
      </div>
    </div>
  );
}

export function EmptyRepoState({ workspacePath }: { workspacePath: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3v12a3 3 0 003 3h0a3 3 0 003-3V9" />
            <circle cx="9" cy="3" r="2" />
            <circle cx="15" cy="9" r="2" />
            <circle cx="12" cy="21" r="2" />
          </svg>
        </div>
        <h2 className="text-base font-medium text-[var(--text-primary)]">Not a Git repository</h2>
        <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
          <span className="git-mono text-[var(--text-primary)]">{workspacePath}</span> does not contain a Git repository.
        </p>
      </div>
    </div>
  );
}
