/**
 * The mode banner — "a repo mode you are in", the first of rule 24's three
 * interruption levels.
 *
 * It states what is happening and carries the way out: Abort merge for a merge
 * that stopped, and the two exits from a detached HEAD. Both actions live here
 * because here is the only place they apply (§7).
 */

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { GitManagerRequest } from '../../../shared/types';
import type { RepoModeInfo } from '../../lib/repo-mode';

interface Props {
  info: RepoModeInfo;
  /** Where "Return to …" goes — the default branch, when there is one. */
  defaultBranch?: string;
  onAction: (action: GitManagerRequest) => void;
  /** Leaving a detached HEAD is a branch switch, so it asks about changes too. */
  onRequestCheckout: (branch: string) => void;
}

export function ModeBanner({ info, defaultBranch, onAction, onRequestCheckout }: Props) {
  if (info.mode === 'merging') {
    return (
      <Banner tone="error">
        <span>
          <b className="font-medium">Merging {info.mergeFrom ?? 'a branch'} in.</b>{' '}
          {mergeProgress(info)}
        </span>
        <BannerButton onClick={() => onAction({ action: 'abort_merge' })}>
          Abort merge
        </BannerButton>
      </Banner>
    );
  }

  if (info.mode === 'detached') {
    return (
      <Banner tone="warning">
        <span>
          <b className="font-medium">You're not on a branch.</b>{' '}
          Commits made here belong to nothing and will be lost once you switch away.
        </span>
        {defaultBranch && (
          <BannerButton onClick={() => onRequestCheckout(defaultBranch)}>
            Return to {defaultBranch}
          </BannerButton>
        )}
        <CreateBranchHere onCreate={(branch) => onAction({ action: 'create_branch', branch })} />
      </Banner>
    );
  }

  return null;
}

function mergeProgress(info: RepoModeInfo): string {
  const total = info.conflictPaths.length;
  if (info.conflicts === 0) {
    return 'Every conflict is resolved — conclude the merge to finish it.';
  }
  return `${info.conflicts} of ${total} conflicted file${total === 1 ? '' : 's'} still needs you — `
    + 'resolve them, then conclude the merge.';
}

/** Naming the branch happens in place; a dialog is reserved for the dirty switch. */
function CreateBranchHere({ onCreate }: { onCreate: (branch: string) => void }) {
  const [name, setName] = useState<string | null>(null);

  if (name === null) {
    return (
      <BannerButton primary onClick={() => setName('')}>Create branch here</BannerButton>
    );
  }

  const trimmed = name.trim();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        aria-label="New branch name"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed) onCreate(trimmed);
          if (event.key === 'Escape') setName(null);
        }}
        placeholder="Branch name"
        className="h-6 w-40 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-[0.84rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
      />
      <BannerButton primary disabled={!trimmed} onClick={() => onCreate(trimmed)}>
        Create
      </BannerButton>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'error' | 'warning'; children: React.ReactNode }) {
  const palette = tone === 'error'
    ? 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]'
    : 'border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] text-[var(--status-warning)]';

  return (
    <div className={`flex shrink-0 items-center gap-2 border-b px-3 py-1.5 ${palette}`}>
      <AlertCircle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {children}
      </span>
    </div>
  );
}

function BannerButton({
  children, onClick, primary, disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-6 shrink-0 rounded-md px-2 text-[0.84rem] disabled:opacity-40 ${
        primary
          ? 'bg-[var(--brand-primary)] font-medium text-[var(--brand-primary-foreground)] hover:bg-[var(--brand-primary-hover)]'
          : 'border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  );
}
