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
    <div className="border-b border-[var(--border-subtle)]">
      <button type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-1.5 text-sm font-semibold tracking-wider text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <div className="flex items-center gap-1.5">
          <ChevronIcon open={open} />
          {title}
        </div>
        <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
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
    <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 py-2">
      <input aria-label="Branch name"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="feature/my-branch"
        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5
          text-sm text-[var(--text-primary)] outline-none transition-colors git-mono
          placeholder-[var(--text-muted)] focus:border-[var(--brand-secondary)]"
      />
      {branchNameExists && (
        <p className="text-sm text-[var(--status-error)]">
          A branch with that name already exists.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button"
          onClick={onSubmit}
          disabled={!value.trim() || branchNameExists}
          className="rounded-md bg-[var(--brand-secondary)] px-2 py-1 text-sm font-medium text-white
            transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
        >
          Create
        </button>
        <button type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-sm text-[var(--text-secondary)]
            transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
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
      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-muted)]
        transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--brand-secondary)]"
    >
      <PlusIcon />
      <span>{label}</span>
    </button>
  );
}

export function RemoteBranchGroup({
  name,
  host,
  webUrl,
  branches,
  formatLabel,
  onOpenRemote,
}: {
  name: string;
  host?: string;
  /** Null when the remote has no browsable page — a local path, say. */
  webUrl?: string | null;
  branches: BranchInfo[];
  formatLabel?: (name: string) => string;
  onOpenRemote?: (url: string) => void;
}) {
  const openable = Boolean(webUrl && onOpenRemote);

  return (
    <div className="border-t border-[var(--border-subtle)] first:border-t-0">
      {/* The remote's own row is where it lives; clicking it goes there. */}
      <button
        type="button"
        disabled={!openable}
        title={openable ? `Open ${webUrl} in your browser` : (host || name)}
        onClick={() => { if (webUrl) onOpenRemote?.(webUrl); }}
        className={`group flex w-full items-center gap-2 px-3 py-1 text-left ${
          openable
            ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--brand-secondary)]'
            : 'cursor-default text-[var(--text-secondary)]'
        }`}
      >
        <CloudIcon />
        <span className="truncate text-sm">{name}</span>
        {host && (
          <span className="ml-auto truncate text-sm text-[var(--text-muted)]">{host}</span>
        )}
        {openable && <ExternalIcon />}
      </button>
      <div>
        {branches.map((branch) => (
          <BranchRow
            key={branch.name}
            branch={branch}
            label={formatLabel ? formatLabel(branch.name) : branch.name}
            isCurrent={false}
            dense
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

function ExternalIcon() {
  return (
    <svg
      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      width="10" height="10" viewBox="0 0 10 10"
      fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
    >
      <path d="M4 1H1v8h8V6M6 1h3v3M9 1L4.5 5.5" />
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
