import type { KeyboardEvent, ReactNode } from 'react';

import type { BranchInfo } from '../../shared/types';
import { BranchRow } from './BranchPanelRows';

export function Section({
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
  children: ReactNode;
}) {
  return (
    <div className="border-b border-[var(--g-border)]">
      <button type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold tracking-wider text-[var(--g-dim)] transition-colors hover:text-[var(--g-muted)]"
      >
        <div className="flex items-center gap-1.5">
          <ChevronIcon open={open} />
          {title}
        </div>
        <span className="rounded bg-[var(--g-elevated)] px-1.5 py-0.5 text-xs text-[var(--g-dim)]">
          {count}
        </span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

export function CreateBranchForm({
  value,
  branchNameExists,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  branchNameExists: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-2 border-t border-[var(--g-border)] px-3 py-2">
      <input aria-label="Branch name"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="feature/my-branch"
        className="w-full rounded-md border border-[var(--g-border)] bg-[var(--g-elevated)] px-2.5 py-1.5
          text-sm text-[var(--g-text)] outline-none transition-colors git-mono
          placeholder-[var(--g-dim)] focus:border-[var(--g-accent)]"
      />
      {branchNameExists && (
        <p className="text-sm text-[var(--g-red)]">
          A branch with that name already exists.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={onSubmit}
          disabled={!value.trim() || branchNameExists}
          className="rounded-md bg-[var(--g-accent)] px-2 py-1 text-sm font-medium text-white
            transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
        >
          Create
        </button>
        <button type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--g-border)] px-2 py-1 text-sm text-[var(--g-muted)]
            transition-colors hover:border-[var(--g-border-bright)] hover:text-[var(--g-text)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SectionActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--g-dim)]
        transition-colors hover:bg-[var(--g-hover)] hover:text-[var(--g-accent)]"
    >
      <PlusIcon />
      <span>{label}</span>
    </button>
  );
}

export function RemoteBranchGroup({
  name,
  host,
  branches,
  formatLabel,
}: {
  name: string;
  host?: string;
  branches: BranchInfo[];
  formatLabel?: (name: string) => string;
}) {
  return (
    <div className="border-t border-[var(--g-border)] first:border-t-0">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <CloudIcon />
        <span className="truncate text-sm text-[var(--g-muted)]">{name}</span>
        {host && (
          <span className="ml-auto truncate text-sm text-[var(--g-dim)]">{host}</span>
        )}
      </div>
      <div className="pb-1">
        {branches.map((branch) => (
          <BranchRow
            key={branch.name}
            branch={branch}
            label={formatLabel ? formatLabel(branch.name) : branch.name}
            isCurrent={false}
          />
        ))}
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

function CloudIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 12a3 3 0 01-.5-5.96A4.5 4.5 0 0112.5 7a3 3 0 01.5 5.96H4z" />
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
