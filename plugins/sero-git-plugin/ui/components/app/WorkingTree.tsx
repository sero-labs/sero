/**
 * The working tree — Staged and Changes, explicitly, not tickboxes.
 *
 * Grouped by what you must do about the file, not by type (design rule 15), so
 * the list is the to-do list. Row actions appear on hover and take the meta's
 * place so nothing reflows (rule 12); the primary action per surface is the one
 * green button (rule 16), and the commit button names its object (rule 27).
 */

import { useCallback, useState } from 'react';
import { FileText, Minus, Plus } from 'lucide-react';
import type { FileChange, GitManagerRequest } from '../../../shared/types';

const STATUS_COLOUR: Record<FileChange['status'], string> = {
  added: 'var(--status-success)',
  modified: 'var(--status-warning)',
  deleted: 'var(--status-error)',
  renamed: 'var(--status-info)',
  copied: 'var(--status-info)',
  untracked: 'var(--status-info)',
  conflict: 'var(--status-error)',
};

export interface WorkingTreeSelection {
  path: string;
  staged: boolean;
}

interface Props {
  fileChanges: FileChange[];
  onAction: (action: GitManagerRequest) => void;
  onSelectFile: (path: string, staged: boolean) => void;
  onOpenInEditor: (path: string) => void;
  selectedFile: WorkingTreeSelection | null;
  /** Blocks committing, with the reason shown beneath the button (rule 20). */
  commitBlockedReason?: string | null;
}

export function WorkingTree({
  fileChanges, onAction, onSelectFile, onOpenInEditor, selectedFile, commitBlockedReason,
}: Props) {
  const [message, setMessage] = useState('');
  const staged = fileChanges.filter((file) => file.staged);
  const changes = fileChanges.filter((file) => !file.staged);

  const commit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onAction({ action: 'commit', message: trimmed });
    setMessage('');
  }, [message, onAction]);

  const canCommit = staged.length > 0 && message.trim().length > 0 && !commitBlockedReason;

  return (
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto git-scrollbar">
        <Section
          label="Staged"
          count={staged.length}
          action={staged.length > 0
            ? { label: 'Unstage all', onClick: () => onAction({ action: 'unstage', all: true }) }
            : undefined}
        >
          {staged.map((file) => (
            <FileRow
              key={`staged:${file.path}`}
              file={file}
              selected={selectedFile?.path === file.path && selectedFile.staged}
              onSelect={() => onSelectFile(file.path, true)}
              onOpenInEditor={() => onOpenInEditor(file.path)}
              actions={[{
                label: `Unstage ${file.path}`,
                icon: <Minus className="size-3" />,
                onClick: () => onAction({ action: 'unstage', file: file.path }),
              }]}
            />
          ))}
          {staged.length === 0 && <EmptyRow>Nothing staged</EmptyRow>}
        </Section>

        <Section
          label="Changes"
          count={changes.length}
          action={changes.length > 0
            ? { label: 'Stage all', onClick: () => onAction({ action: 'stage', all: true }) }
            : undefined}
        >
          {changes.map((file) => (
            <FileRow
              key={`changes:${file.path}`}
              file={file}
              selected={selectedFile?.path === file.path && !selectedFile.staged}
              onSelect={() => onSelectFile(file.path, false)}
              onOpenInEditor={() => onOpenInEditor(file.path)}
              actions={[{
                label: `Stage ${file.path}`,
                icon: <Plus className="size-3" />,
                onClick: () => onAction({ action: 'stage', file: file.path }),
              }]}
            />
          ))}
          {changes.length === 0 && <EmptyRow>No changes</EmptyRow>}
        </Section>
      </div>

      {/* ── Commit ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
        <textarea
          aria-label="Commit message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit();
          }}
          rows={2}
          placeholder="Message"
          className="w-full resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-[0.84rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          className="mt-1.5 h-7 w-full rounded-md bg-[var(--brand-primary)] text-[0.84rem] font-medium text-[var(--brand-primary-foreground)] transition-colors hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {staged.length === 1 ? 'Commit 1 file' : `Commit ${staged.length} files`}
        </button>
        {/* The reason sits with the control, not in a tooltip or a toast. */}
        {commitBlockedReason && (
          <p className="mt-1 text-xs text-[var(--status-warning)]">{commitBlockedReason}</p>
        )}
      </div>
    </div>
  );
}

function Section({
  label, count, action, children,
}: {
  label: string;
  count: number;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="sticky top-0 z-10 flex h-6 items-center gap-1.5 bg-[var(--bg-surface)] px-3">
        <span className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{label}</span>
        <span className="text-xs text-[var(--text-muted)]/70">{count}</span>
        <span className="flex-1" />
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

interface RowAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

function FileRow({
  file, selected, onSelect, onOpenInEditor, actions,
}: {
  file: FileChange;
  selected: boolean;
  onSelect: () => void;
  onOpenInEditor: () => void;
  actions: RowAction[];
}) {
  const slash = file.path.lastIndexOf('/');
  const dir = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const name = slash === -1 ? file.path : file.path.slice(slash + 1);

  return (
    <div
      onClick={onSelect}
      title={file.path}
      className={`group flex h-[26px] cursor-pointer items-center gap-2 px-3 hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: STATUS_COLOUR[file.status] }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
        {name}
      </span>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <RowButton label={`Open ${name} in the editor`} onClick={onOpenInEditor}>
          <FileText className="size-3" />
        </RowButton>
        {actions.map((action) => (
          <RowButton
            key={action.label}
            label={action.label}
            onClick={action.onClick}
            destructive={action.destructive}
          >
            {action.icon}
          </RowButton>
        ))}
      </div>
    </div>
  );
}

function RowButton({
  label, onClick, destructive, children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      className={`flex size-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] ${
        destructive ? 'hover:text-[var(--status-error)]' : 'hover:text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[26px] items-center px-3 text-xs text-[var(--text-muted)]">{children}</div>
  );
}
