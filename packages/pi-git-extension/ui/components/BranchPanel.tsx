/**
 * Left sidebar — branches, remotes, stashes.
 */

import { useState } from 'react';
import type { BranchInfo, GitManagerRequest, RemoteInfo, StashEntry } from '../../shared/types';

interface BranchPanelProps {
  branches: BranchInfo[];
  remotes: RemoteInfo[];
  stashes: StashEntry[];
  currentBranch: string;
  onAction: (action: GitManagerRequest) => void;
}

export function BranchPanel({ branches, remotes, stashes, currentBranch, onAction }: BranchPanelProps) {
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [stashOpen, setStashOpen] = useState(true);

  const localBranches = branches.filter((b) => !b.remote?.startsWith('origin/') || b.name === b.remote?.replace('origin/', ''));

  return (
    <div className="w-52 shrink-0 border-r border-[var(--g-border)] overflow-y-auto git-scrollbar bg-[var(--g-surface)]">
      {/* Local Branches */}
      <Section title="LOCAL" count={localBranches.length} open={localOpen} onToggle={() => setLocalOpen(!localOpen)}>
        {localBranches.map((b) => (
          <BranchRow
            key={b.name}
            branch={b}
            isCurrent={b.name === currentBranch}
            onCheckout={() => onAction({ action: 'checkout', branch: b.name })}
          />
        ))}
        <button
          onClick={() => {
            const name = prompt('New branch name:');
            if (name?.trim()) onAction({ action: 'create_branch', branch: name.trim() });
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--g-dim)]
            hover:text-[var(--g-accent)] hover:bg-[var(--g-hover)] transition-colors cursor-pointer"
        >
          <PlusIcon />
          <span>New branch</span>
        </button>
      </Section>

      {/* Remotes */}
      <Section title="REMOTE" count={remotes.length} open={remoteOpen} onToggle={() => setRemoteOpen(!remoteOpen)}>
        {remotes.map((r) => (
          <div key={r.name} className="flex items-center gap-2 px-3 py-1.5">
            <CloudIcon />
            <span className="text-xs text-[var(--g-muted)] truncate">{r.name}</span>
            <span className="text-[10px] text-[var(--g-dim)] truncate ml-auto">{extractHostname(r.fetchUrl)}</span>
          </div>
        ))}
      </Section>

      {/* Stashes */}
      <Section title="STASHES" count={stashes.length} open={stashOpen} onToggle={() => setStashOpen(!stashOpen)}>
        {stashes.map((s) => (
          <div
            key={s.hash || s.index}
            className="flex items-center gap-2 px-3 py-1.5 group hover:bg-[var(--g-hover)] cursor-pointer"
            onClick={() => onAction({ action: 'stash_pop', stashIndex: s.index })}
            title={`Click to pop stash@{${s.index}}`}
          >
            <StashIcon />
            <span className="text-xs text-[var(--g-muted)] truncate flex-1">{s.message}</span>
            <span className="text-[10px] text-[var(--g-dim)] opacity-0 group-hover:opacity-100">pop</span>
          </div>
        ))}
        <button
          onClick={() => onAction({ action: 'stash' })}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--g-dim)]
            hover:text-[var(--g-accent)] hover:bg-[var(--g-hover)] transition-colors cursor-pointer"
        >
          <PlusIcon />
          <span>Stash changes</span>
        </button>
      </Section>
    </div>
  );
}

// ── Section collapsible ─────────────────────────────────────

function Section({
  title, count, open, onToggle, children,
}: {
  title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--g-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold
          tracking-wider text-[var(--g-dim)] hover:text-[var(--g-muted)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <ChevronIcon open={open} />
          {title}
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--g-elevated)] text-[var(--g-dim)]">
          {count}
        </span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

// ── Branch row ──────────────────────────────────────────────

function BranchRow({
  branch, isCurrent, onCheckout,
}: {
  branch: BranchInfo; isCurrent: boolean; onCheckout: () => void;
}) {
  return (
    <div
      onClick={isCurrent ? undefined : onCheckout}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors
        ${isCurrent
          ? 'text-[var(--g-accent)] bg-[var(--g-glow)]'
          : 'text-[var(--g-muted)] hover:bg-[var(--g-hover)] hover:text-[var(--g-text)] cursor-pointer'
        }`}
    >
      <BranchIcon active={isCurrent} />
      <span className="truncate flex-1 git-mono text-[11px]">{branch.name}</span>
      {(branch.ahead > 0 || branch.behind > 0) && (
        <div className="flex items-center gap-1 text-[9px]">
          {branch.ahead > 0 && <span className="text-[var(--g-green)]">+{branch.ahead}</span>}
          {branch.behind > 0 && <span className="text-[var(--g-red)]">-{branch.behind}</span>}
        </div>
      )}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round"
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

function extractHostname(url: string): string {
  try {
    if (url.startsWith('git@')) {
      return url.split(':')[0]?.replace('git@', '') ?? url;
    }
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
