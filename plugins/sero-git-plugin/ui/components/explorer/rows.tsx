/**
 * The Explorer Git view's rows and section headers.
 *
 * One row scale everywhere (design rule 10): file and commit rows are the same
 * height on every surface, and they never wrap — long values truncate so the
 * identifying part survives. Row actions appear on hover and take the meta's
 * place, so nothing reflows (rule 12).
 */

import { FileText } from 'lucide-react';
import type { CommitEntry, StatusFile } from '@sero-ai/common';

/** File status is one 6px dot (rule 18). */
const STATUS_COLOUR: Record<string, string> = {
  added: 'var(--status-success)',
  modified: 'var(--status-warning)',
  deleted: 'var(--status-error)',
  renamed: 'var(--status-info)',
  copied: 'var(--status-info)',
  conflict: 'var(--status-error)',
};

export function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="sticky top-0 z-10 flex h-6 shrink-0 items-center gap-1.5 bg-[var(--bg-surface)] px-3">
      <span className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{label}</span>
      {/* Counts are plain text, never pills (rule 6). */}
      {count !== undefined && (
        <span className="text-xs text-[var(--text-muted)]/70">{count}</span>
      )}
    </div>
  );
}

interface FileRowProps {
  file: StatusFile;
  selected: boolean;
  onSelect: () => void;
  onOpenInEditor: () => void;
}

export function FileRow({ file, selected, onSelect, onOpenInEditor }: FileRowProps) {
  const slash = file.path.lastIndexOf('/');
  const dir = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const name = slash === -1 ? file.path : file.path.slice(slash + 1);

  return (
    <div
      className={`group flex h-[26px] shrink-0 cursor-pointer items-center gap-2 px-3 hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
      onClick={onSelect}
      title={file.path}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: STATUS_COLOUR[file.status] ?? 'var(--text-muted)' }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
        {name}
      </span>
      {/* Opening the file is the Editor's job, so it switches views (§1). */}
      <button
        type="button"
        aria-label={`Open ${name} in the editor`}
        onClick={(event) => { event.stopPropagation(); onOpenInEditor(); }}
        className="hidden size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)] group-hover:flex"
      >
        <FileText className="size-3" />
      </button>
    </div>
  );
}

interface CommitRowProps {
  commit: CommitEntry;
  selected: boolean;
  onSelect: () => void;
}

export function CommitRow({ commit, selected, onSelect }: CommitRowProps) {
  return (
    <div
      className={`flex h-[26px] shrink-0 cursor-pointer items-center gap-2 px-3 hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
      onClick={onSelect}
      title={commit.description}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          commit.isWorkingCopy ? 'bg-[var(--accent-violet,var(--brand-primary))]' : 'bg-[var(--text-muted)]/50'
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {commit.description}
      </span>
      {/* Monospace is for machine values only (rule 9). */}
      <span className="shrink-0 font-mono text-[0.72rem] text-[var(--text-muted)]">{commit.sha}</span>
    </div>
  );
}
