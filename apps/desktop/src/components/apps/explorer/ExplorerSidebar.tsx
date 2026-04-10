import type { ExplorerPanel } from './ActivityBar';
import type { EditorRoot } from '@/types/ipc';
import { MultiRootFileTree } from './file-tree/MultiRootFileTree';
import { VcsPanel } from './vcs/VcsPanel';
import { OrchestrationPanel } from './orchestration/OrchestrationPanel';

const panelTitles: Record<ExplorerPanel, string> = {
  explorer: 'Explorer',
  git: 'Source Control',
  orchestration: 'Orchestration',
  terminal: 'Terminal',
};

interface ExplorerSidebarProps {
  activePanel: ExplorerPanel;
  workspaceId: string;
  /** Props forwarded to the file tree when panel=explorer. */
  fileTreeProps?: {
    workspaceId: string;
    roots: EditorRoot[];
    activePath: string | null;
    onFileSelect: (path: string) => void;
    onPathChanged?: (oldPath: string, newPath: string) => void;
    onDeleted?: (path: string) => void;
    onRemoveRoot?: (rootId: string) => void;
  };
  /** Called when VcsPanel wants to open a diff in the editor area. */
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

/**
 * ExplorerSidebar — panel content for the explorer workspace activity bar.
 *
 * Explorer panel renders the FileTree; other panels are placeholders.
 */
export function ExplorerSidebar({ activePanel, workspaceId, fileTreeProps, onOpenDiff }: ExplorerSidebarProps) {
  const title = panelTitles[activePanel];

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--bg-surface)]">
      {/* ── Header (hidden for git/orchestration — they have their own) ── */}
      {activePanel !== 'git' && activePanel !== 'orchestration' && (
        <div className="flex h-7 shrink-0 items-center px-4">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </span>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden" data-testid="explorer-sidebar-content">
        {activePanel === 'explorer' && fileTreeProps ? (
          <MultiRootFileTree {...fileTreeProps} />
        ) : activePanel === 'git' ? (
          <VcsPanel workspaceId={workspaceId} onOpenDiff={onOpenDiff} />
        ) : activePanel === 'orchestration' ? (
          <OrchestrationPanel workspaceId={workspaceId} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <span className="text-xs text-[var(--text-muted)]">{title} panel</span>
          </div>
        )}
      </div>
    </aside>
  );
}
