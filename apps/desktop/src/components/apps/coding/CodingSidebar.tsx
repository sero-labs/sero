import type { CodingPanel } from './ActivityBar';
import { FileTree } from './file-tree/FileTree';
import { VcsPanel } from './vcs/VcsPanel';
import { OrchestrationPanel } from './orchestration/OrchestrationPanel';

const panelTitles: Record<CodingPanel, string> = {
  explorer: 'Explorer',
  search: 'Search',
  git: 'Source Control',
  orchestration: 'Orchestration',
  terminal: 'Terminal',
};

interface CodingSidebarProps {
  activePanel: CodingPanel;
  workspaceId: string;
  /** Props forwarded to the FileTree when panel=explorer. */
  fileTreeProps?: {
    workspaceId: string;
    rootId: string;
    activePath: string | null;
    onFileSelect: (path: string) => void;
    onPathChanged?: (oldPath: string, newPath: string) => void;
    onDeleted?: (path: string) => void;
  };
  /** Called when VcsPanel wants to open a diff in the editor area. */
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

/**
 * CodingSidebar — panel content for the coding workspace activity bar.
 *
 * Explorer panel renders the FileTree; other panels are placeholders.
 */
export function CodingSidebar({ activePanel, workspaceId, fileTreeProps, onOpenDiff }: CodingSidebarProps) {
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
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden" data-testid="coding-sidebar-content">
        {activePanel === 'explorer' && fileTreeProps ? (
          <FileTree {...fileTreeProps} />
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
