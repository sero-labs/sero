import { useState, useCallback, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { EditorRoot } from '@/types/ipc';
import { FileTree } from './FileTree';

interface MultiRootFileTreeProps {
  workspaceId: string;
  roots: EditorRoot[];
  activePath: string | null;
  onFileSelect: (path: string) => void;
  onPathChanged?: (oldPath: string, newPath: string) => void;
  onDeleted?: (path: string) => void;
  /** Optional callback to remove an additional root (not the primary). */
  onRemoveRoot?: (rootId: string) => void;
}

/**
 * MultiRootFileTree, renders one collapsible <FileTree> per workspace root.
 *
 * When a workspace has only the primary root, this collapses to a single
 * full-height FileTree (no header) so the UX is identical to the previous
 * single-root explorer.
 *
 * With multiple roots, each root gets a collapsible header. Expanded roots
 * share the vertical space (flex-1) so the user always sees something for
 * every visible root, similar to VS Code's multi-root explorer.
 */
export const MultiRootFileTree = memo(function MultiRootFileTree({
  workspaceId,
  roots,
  activePath,
  onFileSelect,
  onPathChanged,
  onDeleted,
  onRemoveRoot,
}: MultiRootFileTreeProps) {
  // Single-root path: render the legacy full-height FileTree directly.
  if (roots.length <= 1) {
    const root = roots[0];
    return (
      <FileTree
        workspaceId={workspaceId}
        rootId={root?.virtualPath ?? '/workspace'}
        activePath={activePath}
        onFileSelect={onFileSelect}
        onPathChanged={onPathChanged}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {roots.map((root) => (
        <RootSection
          key={root.id}
          root={root}
          workspaceId={workspaceId}
          activePath={activePath}
          onFileSelect={onFileSelect}
          onPathChanged={onPathChanged}
          onDeleted={onDeleted}
          onRemoveRoot={onRemoveRoot}
        />
      ))}
    </div>
  );
});

interface RootSectionProps {
  root: EditorRoot;
  workspaceId: string;
  activePath: string | null;
  onFileSelect: (path: string) => void;
  onPathChanged?: (oldPath: string, newPath: string) => void;
  onDeleted?: (path: string) => void;
  onRemoveRoot?: (rootId: string) => void;
}

const RootSection = memo(function RootSection({
  root,
  workspaceId,
  activePath,
  onFileSelect,
  onPathChanged,
  onDeleted,
  onRemoveRoot,
}: RootSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const isPrimary = root.kind === 'workspace';
  const isAttachedFolder = !isPrimary;

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col border-b border-[var(--border-subtle)] last:border-b-0',
        expanded && 'flex-1',
      )}
      data-root-id={root.id}
    >
      <div className="group flex h-7 shrink-0 items-center gap-1 pr-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        <button
          type="button"
          onClick={toggle}
          className="flex h-full flex-1 items-center gap-1 truncate pl-3 text-left hover:text-[var(--text-primary)]"
          title={`${root.name}, ${root.virtualPath}`}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <span className="flex-1 truncate text-left">{root.name}</span>
        </button>
        {isAttachedFolder && (
          <span className="rounded bg-[var(--bg-elevated)] px-1 py-px text-[9px] font-normal normal-case tracking-normal text-[var(--text-muted)]">
            attached
          </span>
        )}
        {!isPrimary && onRemoveRoot && (
          <button
            type="button"
            onClick={() => onRemoveRoot(root.id)}
            className="ml-1 rounded px-1 text-[var(--text-muted)] opacity-0 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] group-hover:opacity-100 focus-visible:opacity-100"
            title="Detach folder"
            aria-label={`Detach folder ${root.name}`}
          >
            ×
          </button>
        )}
      </div>
      {expanded && (
        <div className="min-h-0 flex-1">
          <FileTree
            workspaceId={workspaceId}
            rootId={root.virtualPath}
            activePath={activePath}
            onFileSelect={onFileSelect}
            onPathChanged={onPathChanged}
            onDeleted={onDeleted}
          />
        </div>
      )}
    </div>
  );
});
