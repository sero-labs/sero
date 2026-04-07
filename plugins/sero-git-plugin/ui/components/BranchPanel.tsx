/**
 * Left sidebar — branches, remotes, stashes.
 */

import { useMemo, useState } from 'react';
import type { BranchInfo, GitManagerRequest, StashEntry } from '../../shared/types';
import type { RemoteInfo } from '../../shared/types';
import {
  formatBranchLabel,
  groupRemoteBranches,
  sortBranchesForDisplay,
} from '../lib/branch-groups';

interface BranchPanelProps {
  branches: BranchInfo[];
  remoteBranches: BranchInfo[];
  remotes: RemoteInfo[];
  stashes: StashEntry[];
  currentBranch: string;
  onAction: (action: GitManagerRequest) => void;
}

export function BranchPanel({
  branches,
  remoteBranches,
  remotes,
  stashes,
  currentBranch,
  onAction,
}: BranchPanelProps) {
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [stashOpen, setStashOpen] = useState(true);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [confirmPopIndex, setConfirmPopIndex] = useState<number | null>(null);

  const localBranches = useMemo(() => sortBranchesForDisplay(branches), [branches]);
  const remoteGroups = useMemo(() => groupRemoteBranches(remoteBranches, remotes), [remoteBranches, remotes]);
  const trimmedBranchName = newBranchName.trim();
  const branchNameExists = useMemo(
    () => localBranches.some((branch) => branch.name === trimmedBranchName),
    [localBranches, trimmedBranchName],
  );

  const resetBranchForm = () => {
    setCreatingBranch(false);
    setNewBranchName('');
  };

  const submitBranch = () => {
    if (!trimmedBranchName || branchNameExists) return;
    onAction({ action: 'create_branch', branch: trimmedBranchName });
    resetBranchForm();
  };

  const handleStashApply = (stashIndex: number) => {
    setConfirmPopIndex((current) => current === stashIndex ? null : current);
    onAction({ action: 'stash_apply', stashIndex });
  };

  const handleStashPop = (stashIndex: number) => {
    if (confirmPopIndex !== stashIndex) {
      setConfirmPopIndex(stashIndex);
      return;
    }

    setConfirmPopIndex(null);
    onAction({ action: 'stash_pop', stashIndex });
  };

  return (
    <div
      className="w-64 min-w-[13rem] max-w-[24rem] shrink-0 resize-x overflow-auto border-r border-[var(--g-border)] bg-[var(--g-surface)] git-scrollbar"
      style={{ minHeight: 0 }}
    >
      <div className="min-h-full">
        <Section title="LOCAL" count={localBranches.length} open={localOpen} onToggle={() => setLocalOpen(!localOpen)}>
          {localBranches.map((branch) => (
            <BranchRow
              key={branch.name}
              branch={branch}
              label={branch.name}
              isCurrent={branch.name === currentBranch}
              onCheckout={() => onAction({ action: 'checkout', branch: branch.name })}
            />
          ))}

          {creatingBranch ? (
            <div className="space-y-2 border-t border-[var(--g-border)] px-3 py-2">
              <input
                type="text"
                autoFocus
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitBranch();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    resetBranchForm();
                  }
                }}
                placeholder="feature/my-branch"
                className="w-full rounded-md border border-[var(--g-border)] bg-[var(--g-elevated)] px-2.5 py-1.5
                  text-[11px] text-[var(--g-text)] outline-none transition-colors git-mono
                  placeholder-[var(--g-dim)] focus:border-[var(--g-accent)]"
              />
              {branchNameExists && (
                <p className="text-[10px] text-[var(--g-red)]">
                  A branch with that name already exists.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={submitBranch}
                  disabled={!trimmedBranchName || branchNameExists}
                  className="rounded-md bg-[var(--g-accent)] px-2 py-1 text-[10px] font-medium text-white
                    transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
                >
                  Create
                </button>
                <button
                  onClick={resetBranchForm}
                  className="rounded-md border border-[var(--g-border)] px-2 py-1 text-[10px] text-[var(--g-muted)]
                    transition-colors hover:border-[var(--g-border-bright)] hover:text-[var(--g-text)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreatingBranch(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--g-dim)]
                transition-colors hover:bg-[var(--g-hover)] hover:text-[var(--g-accent)]"
            >
              <PlusIcon />
              <span>New branch</span>
            </button>
          )}
        </Section>

        <Section title="REMOTE" count={remoteBranches.length} open={remoteOpen} onToggle={() => setRemoteOpen(!remoteOpen)}>
          {remoteGroups.map((group) => (
            <div key={group.name} className="border-t border-[var(--g-border)] first:border-t-0">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <CloudIcon />
                <span className="truncate text-[11px] text-[var(--g-muted)]">{group.name}</span>
                {group.host && (
                  <span className="ml-auto truncate text-[10px] text-[var(--g-dim)]">{group.host}</span>
                )}
              </div>
              <div className="pb-1">
                {group.branches.map((branch) => (
                  <BranchRow
                    key={branch.name}
                    branch={branch}
                    label={formatBranchLabel(branch.name)}
                    isCurrent={false}
                  />
                ))}
              </div>
            </div>
          ))}
          {remoteGroups.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-[var(--g-dim)]">No remote branches</div>
          )}
        </Section>

        <Section title="STASHES" count={stashes.length} open={stashOpen} onToggle={() => setStashOpen(!stashOpen)}>
          {stashes.map((stash) => (
            <StashRow
              key={stash.hash || stash.index}
              stash={stash}
              confirmPop={confirmPopIndex === stash.index}
              onApply={() => handleStashApply(stash.index)}
              onPop={() => handleStashPop(stash.index)}
            />
          ))}
          <button
            onClick={() => onAction({ action: 'stash' })}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--g-dim)]
              transition-colors hover:bg-[var(--g-hover)] hover:text-[var(--g-accent)]"
          >
            <PlusIcon />
            <span>Stash changes</span>
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--g-border)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold tracking-wider text-[var(--g-dim)] transition-colors hover:text-[var(--g-muted)]"
      >
        <div className="flex items-center gap-1.5">
          <ChevronIcon open={open} />
          {title}
        </div>
        <span className="rounded bg-[var(--g-elevated)] px-1.5 py-0.5 text-[9px] text-[var(--g-dim)]">
          {count}
        </span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

function BranchRow({
  branch,
  label,
  isCurrent,
  onCheckout,
}: {
  branch: BranchInfo;
  label: string;
  isCurrent: boolean;
  onCheckout?: () => void;
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
          ? 'bg-[var(--g-glow)] text-[var(--g-accent)]'
          : checkedOutElsewhere
            ? 'cursor-default text-[var(--g-dim)] opacity-70'
            : onCheckout
              ? 'cursor-pointer text-[var(--g-muted)] hover:bg-[var(--g-hover)] hover:text-[var(--g-text)]'
              : 'text-[var(--g-muted)]'
        }`}
    >
      <BranchIcon active={isCurrent} />
      <span className="min-w-0 flex-1 truncate git-mono text-[11px]">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        {checkedOutElsewhere && (
          <span className="rounded bg-[var(--g-elevated)] px-1 py-0.5 text-[8px] uppercase tracking-wider text-[var(--g-dim)]">
            WT
          </span>
        )}
        {(branch.ahead > 0 || branch.behind > 0) && (
          <div className="flex items-center gap-1 text-[9px]">
            {branch.ahead > 0 && <span className="text-[var(--g-green)]">+{branch.ahead}</span>}
            {branch.behind > 0 && <span className="text-[var(--g-red)]">-{branch.behind}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function StashRow({
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
    <div className="group border-t border-[var(--g-border)] first:border-t-0 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <StashIcon />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--g-muted)]">{stash.message}</span>
        <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={onApply}
            className="rounded border border-[var(--g-border)] px-1.5 py-0.5 text-[9px] text-[var(--g-muted)] transition-colors hover:border-[var(--g-border-bright)] hover:text-[var(--g-text)]"
          >
            Apply
          </button>
          <button
            onClick={onPop}
            className={`rounded border px-1.5 py-0.5 text-[9px] transition-colors ${confirmPop
              ? 'border-[var(--g-red)] text-[var(--g-red)] hover:bg-[var(--g-red)]/10'
              : 'border-[var(--g-border)] text-[var(--g-muted)] hover:border-[var(--g-border-bright)] hover:text-[var(--g-text)]'
            }`}
          >
            {confirmPop ? 'Confirm pop' : 'Pop'}
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--g-dim)]">
        <span className="git-mono">{`stash@{${stash.index}}`}</span>
        {stash.date && <span>{formatRelativeDate(stash.date)}</span>}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms' }}
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

function BranchIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round"
      stroke={active ? 'var(--g-accent)' : 'currentColor'}>
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <path d="M5 5.5v5M5 8h4.5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 12a3 3 0 01-.5-5.96A4.5 4.5 0 0112.5 7a3 3 0 01.5 5.96H4z" />
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

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M5 2v6M2 5h6" />
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
