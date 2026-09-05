/**
 * Workspace row — copies the desktop `WorkspaceNode` header markup.
 *
 * The hover `Plus` creates a session and selects it straight away, with
 * no dialog, exactly as the desktop does.
 */

import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

interface WorkspaceRowProps {
  name: string;
  isActive: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNewSession: () => void;
}

export function WorkspaceRow({
  name,
  isActive,
  expanded,
  onToggle,
  onNewSession,
}: WorkspaceRowProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const FolderIcon = expanded ? FolderOpen : Folder;

  return (
    <div
      className={cn(
        'group relative mb-1 flex w-full items-center gap-1 rounded-md px-1.5 py-1 transition-colors',
        isActive
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
      )}
    >
      <button
        type="button"
        data-testid="workspace-row"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
      >
        <Chevron
          className={cn(
            'size-3 shrink-0 transition-colors',
            isActive
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]',
          )}
        />
        <FolderIcon className="size-4 shrink-0 fill-[var(--accent-primary)]/25 text-[var(--accent-primary)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
      </button>

      <button
        type="button"
        onClick={onNewSession}
        title="New session"
        aria-label={`New session in ${name}`}
        className="shrink-0 rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
