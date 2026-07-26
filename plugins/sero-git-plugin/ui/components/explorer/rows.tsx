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
import { statusColour } from '../../lib/file-status';

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

  // Picking the file is a button, and Open-in-editor is its sibling — a button
  // cannot contain a button, and a bare div with a click handler cannot be
  // reached from the keyboard.
  return (
    <div
      className={`group flex h-[26px] shrink-0 items-center hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        title={file.path}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-3 text-left"
      >
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: statusColour(file.status) }}
        />
        <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
          {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
          {name}
        </span>
      </button>
      {/* Opening the file is the Editor's job, so it switches views (§1). */}
      <button
        type="button"
        aria-label={`Open ${name} in the editor`}
        onClick={onOpenInEditor}
        className="mr-3 ml-2 hidden size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-secondary)] group-hover:flex"
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
    <button
      type="button"
      className={`flex h-[26px] w-full shrink-0 items-center gap-2 px-3 text-left hover:bg-[var(--bg-elevated)] ${
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
    </button>
  );
}
