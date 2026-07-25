/**
 * The working tree — Staged and Changes, explicitly, not tickboxes.
 *
 * Grouped by what you must do about the file, not by type (design rule 15), so
 * the list is the to-do list. Row actions appear on hover and take the meta's
 * place so nothing reflows (rule 12); the primary action per surface is the one
 * green button (rule 16), and the commit button names its object (rule 27).
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, FileText, Minus, Plus, Undo2 } from 'lucide-react';
import type { FileChange, GitManagerRequest } from '../../../shared/types';
import { statusColour } from '../../lib/file-status';
import { groupForMerge } from '../../lib/merge-groups';
import type { RepoModeInfo } from '../../lib/repo-mode';
import { CommitDraftSparkle, useCommitDraft } from './CommitDraftSparkle';

export interface WorkingTreeSelection {
  path: string;
  staged: boolean;
}

interface Props {
  workspaceId: string;
  fileChanges: FileChange[];
  onAction: (action: GitManagerRequest) => void;
  onSelectFile: (path: string, staged: boolean) => void;
  onOpenInEditor: (path: string) => void;
  selectedFile: WorkingTreeSelection | null;
  /** The repo mode: what the commit button says, and why it may be off. */
  info: RepoModeInfo;
}

export function WorkingTree({
  workspaceId, fileChanges, onAction, onSelectFile, onOpenInEditor, selectedFile, info,
}: Props) {
  // Null means untouched, so git's own merge message can show through without
  // an effect writing it into state behind the user's back.
  const [typedMessage, setTypedMessage] = useState<string | null>(null);
  const message = typedMessage ?? info.suggestedMessage ?? '';
  // Discarding is irreversible, and rule 24 reserves dialogs for switching
  // branch, so the row itself asks a second time.
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);
  const staged = fileChanges.filter((file) => file.staged);
  const changes = fileChanges.filter((file) => !file.staged);
  const merging = info.mode === 'merging';

  const commit = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Nothing is staged in a fresh repository, and asking someone to stage
    // before their first commit is ceremony; every other mode commits what is
    // staged, which is what concludes a merge.
    onAction({ action: 'commit', message: trimmed, all: info.mode === 'unborn' });
    setTypedMessage(null);
  }, [info.mode, message, onAction]);

  // Concluding a merge commits what git already staged; an unborn repo has
  // nothing staged yet, so its first commit stages everything.
  const hasSomethingToCommit = info.mode === 'unborn'
    ? fileChanges.length > 0
    : staged.length > 0;
  const canCommit = hasSomethingToCommit
    && message.trim().length > 0
    && !info.commitBlockedReason;

  // The draft describes what this button would commit, which is not always the
  // staged set — the first commit in a fresh repository stages everything.
  const { drafting, error: draftError, draft } = useCommitDraft(
    workspaceId,
    info.mode === 'unborn' ? 'all' : 'staged',
    setTypedMessage,
  );

  const rowProps = {
    onSelectFile, onOpenInEditor, selectedFile, onAction, pendingDiscard, setPendingDiscard,
  };

  return (
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-surface)]">
      <div className="min-h-0 flex-1 overflow-y-auto git-scrollbar">
        {merging ? (
          <MergeSections
            fileChanges={fileChanges}
            conflictPaths={info.conflictPaths}
            {...rowProps}
          />
        ) : (
        <>
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
              confirmingDiscard={pendingDiscard === file.path}
              onCancelDiscard={() => setPendingDiscard(null)}
              actions={[
                {
                  label: `Discard changes in ${file.path}`,
                  icon: <Undo2 className="size-3" />,
                  destructive: true,
                  onClick: () => {
                    if (pendingDiscard === file.path) {
                      onAction({ action: 'discard', file: file.path });
                      setPendingDiscard(null);
                      return;
                    }
                    setPendingDiscard(file.path);
                  },
                },
                {
                  label: `Stage ${file.path}`,
                  icon: <Plus className="size-3" />,
                  onClick: () => onAction({ action: 'stage', file: file.path }),
                },
              ]}
            />
          ))}
          {changes.length === 0 && <EmptyRow>No changes</EmptyRow>}
        </Section>
        </>
        )}
      </div>

      {/* ── Commit ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
        <div className="relative">
          <textarea
            aria-label="Commit message"
            value={message}
            onChange={(event) => setTypedMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit();
            }}
            rows={2}
            placeholder="Message"
            className="w-full resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] py-1.5 pl-2 pr-8 text-[0.84rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
          />
          <CommitDraftSparkle
            drafting={drafting}
            disabled={!hasSomethingToCommit}
            onClick={draft}
          />
        </div>
        <button
          type="button"
          onClick={commit}
          disabled={!canCommit}
          className="mt-1.5 h-7 w-full rounded-md bg-[var(--brand-primary)] text-[0.84rem] font-medium text-[var(--brand-primary-foreground)] transition-colors hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {info.commitLabel}
        </button>
        {/* The reason sits with the control, not in a tooltip or a toast. */}
        {info.commitBlockedReason && (
          <p className="mt-1 text-xs text-[var(--status-warning)]">{info.commitBlockedReason}</p>
        )}
        {draftError && <p className="mt-1 text-xs text-[var(--status-error)]">{draftError}</p>}
      </div>
    </div>
  );
}

/** Mid-merge the list is the to-do list: what conflicts, what you fixed, what merged itself. */
function MergeSections({
  fileChanges, conflictPaths, onSelectFile, onOpenInEditor, selectedFile, onAction,
}: {
  fileChanges: FileChange[];
  conflictPaths: string[];
  onSelectFile: (path: string, staged: boolean) => void;
  onOpenInEditor: (path: string) => void;
  selectedFile: WorkingTreeSelection | null;
  onAction: (action: GitManagerRequest) => void;
  pendingDiscard: string | null;
  setPendingDiscard: (path: string | null) => void;
}) {
  const groups = useMemo(
    () => groupForMerge(fileChanges, conflictPaths),
    [fileChanges, conflictPaths],
  );

  return (
    <>
      <Section label="Conflicts" count={groups.conflicts.length}>
        {groups.conflicts.map((file) => (
          <FileRow
            key={`conflict:${file.path}`}
            file={file}
            selected={selectedFile?.path === file.path}
            onSelect={() => onSelectFile(file.path, false)}
            onOpenInEditor={() => onOpenInEditor(file.path)}
            actions={[{
              // Git's own definition of resolved is "staged", so this is the
              // escape hatch for anyone who fixed the file in the editor.
              label: `Mark ${file.path} resolved`,
              icon: <Plus className="size-3" />,
              onClick: () => onAction({ action: 'stage', file: file.path }),
            }]}
          />
        ))}
        {groups.conflicts.length === 0 && <EmptyRow>Nothing left to resolve</EmptyRow>}
      </Section>

      {groups.resolved.length > 0 && (
        <Section label="Resolved" count={groups.resolved.length}>
          {groups.resolved.map((file) => (
            <FileRow
              key={`resolved:${file.path}`}
              file={file}
              selected={selectedFile?.path === file.path}
              onSelect={() => onSelectFile(file.path, file.staged)}
              onOpenInEditor={() => onOpenInEditor(file.path)}
              actions={[]}
            />
          ))}
        </Section>
      )}

      {groups.cleanly.length > 0 && (
        <Section label="Merged cleanly" count={groups.cleanly.length}>
          {groups.cleanly.map((file) => (
            <FileRow
              key={`clean:${file.path}`}
              file={file}
              selected={selectedFile?.path === file.path}
              onSelect={() => onSelectFile(file.path, file.staged)}
              onOpenInEditor={() => onOpenInEditor(file.path)}
              actions={[]}
            />
          ))}
        </Section>
      )}
    </>
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
  file, selected, onSelect, onOpenInEditor, actions, confirmingDiscard, onCancelDiscard,
}: {
  file: FileChange;
  selected: boolean;
  onSelect: () => void;
  onOpenInEditor: () => void;
  actions: RowAction[];
  confirmingDiscard?: boolean;
  onCancelDiscard?: () => void;
}) {
  const slash = file.path.lastIndexOf('/');
  const dir = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const name = slash === -1 ? file.path : file.path.slice(slash + 1);

  return (
    <div
      onClick={() => { onCancelDiscard?.(); onSelect(); }}
      title={file.path}
      className={`group flex h-[26px] cursor-pointer items-center gap-2 px-3 hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
    >
      {/* A conflict is the one status that is a job rather than a fact, so it
          gets the warning mark instead of the 6px dot. */}
      {file.status === 'conflict' ? (
        <AlertCircle className="size-3 shrink-0 text-[var(--status-error)]" />
      ) : (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: statusColour(file.status) }}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
        {name}
      </span>
      {confirmingDiscard && (
        <span className="shrink-0 text-xs text-[var(--status-error)]">Discard?</span>
      )}
      <div className={`shrink-0 items-center gap-0.5 ${confirmingDiscard ? 'flex' : 'hidden group-hover:flex'}`}>
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
