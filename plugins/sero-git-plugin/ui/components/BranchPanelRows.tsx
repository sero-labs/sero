import type { BranchInfo, StashEntry } from '../../shared/types';
import { MiddleTruncate } from './MiddleTruncate';

export function BranchRow({
  branch,
  label,
  isCurrent,
  onCheckout,
  laneColour,
}: {
  branch: BranchInfo;
  label: string;
  isCurrent: boolean;
  onCheckout?: () => void;
  /** The colour of this branch's lane in the graph, so the two agree (§3). */
  laneColour?: string;
}) {
  const checkedOutElsewhere = Boolean(branch.checkedOutIn);
  const rowTitle = checkedOutElsewhere
    ? `Checked out in ${branch.checkedOutIn}`
    : isCurrent
      ? 'Current branch'
      : onCheckout
        ? `Switch to ${branch.name}`
        : branch.name;

  return (
    <div
      onClick={!isCurrent && !checkedOutElsewhere ? onCheckout : undefined}
      title={rowTitle}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
        ${isCurrent
          ? 'bg-[var(--brand-secondary-faint)] text-[var(--brand-secondary)]'
          : checkedOutElsewhere
            ? 'cursor-default text-[var(--text-muted)] opacity-70'
            : onCheckout
              ? 'cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]'
        }`}
    >
      {/* The lane colour is the link between the rail and the graph. */}
      {laneColour
        ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: laneColour }} />
        : <BranchIcon active={isCurrent} />}
      <MiddleTruncate value={label} className="min-w-0 flex-1 git-mono text-sm" />
      <div className="flex shrink-0 items-center gap-1">
        {checkedOutElsewhere && (
          <span className="rounded bg-[var(--bg-elevated)] px-1 py-0.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            WT
          </span>
        )}
        {(branch.ahead > 0 || branch.behind > 0) && (
          <div className="flex items-center gap-1 text-xs">
            {branch.ahead > 0 && <span className="text-[var(--status-success)]">+{branch.ahead}</span>}
            {branch.behind > 0 && <span className="text-[var(--status-error)]">-{branch.behind}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function StashRow({
  stash,
  confirmPop,
  onApply,
  onPop,
}: {
  stash: StashEntry;
  confirmPop: boolean;
  onApply: () => void;
  onPop: () => void;
}) {
  return (
    <div className="group border-t border-[var(--border-subtle)] first:border-t-0 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <StashIcon />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">{stash.message}</span>
        <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button type="button"
            onClick={onApply}
            className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
          >
            Apply
          </button>
          <button type="button"
            onClick={onPop}
            className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${confirmPop
              ? 'border-[var(--status-error)] text-[var(--status-error)] hover:bg-[var(--status-error)]/10'
              : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {confirmPop ? 'Confirm pop' : 'Pop'}
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm text-[var(--text-muted)]">
        <span className="git-mono">{`stash@{${stash.index}}`}</span>
        {stash.date && <span>{formatRelativeDate(stash.date)}</span>}
      </div>
    </div>
  );
}

function BranchIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round"
      stroke={active ? 'var(--brand-secondary)' : 'currentColor'}>
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <path d="M5 5.5v5M5 8h4.5" />
    </svg>
  );
}

function StashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M6 6h4M6 8h4M6 10h2" />
    </svg>
  );
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return '';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
