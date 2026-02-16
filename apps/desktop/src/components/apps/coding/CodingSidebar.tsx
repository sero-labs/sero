import type { CodingPanel } from './ActivityBar';
import { FileTree } from './file-tree/FileTree';

const panelTitles: Record<CodingPanel, string> = {
  explorer: 'Explorer',
  search: 'Search',
  git: 'Source Control',
  terminal: 'Terminal',
};

interface CodingSidebarProps {
  activePanel: CodingPanel;
  /** Props forwarded to the FileTree when panel=explorer. */
  fileTreeProps?: {
    workspaceId: string;
    rootId: string;
    activePath: string | null;
    onFileSelect: (path: string) => void;
    onPathChanged?: (oldPath: string, newPath: string) => void;
    onDeleted?: (path: string) => void;
  };
}

/**
 * CodingSidebar — panel content for the coding workspace activity bar.
 *
 * Explorer panel renders the FileTree; other panels are placeholders.
 */
export function CodingSidebar({ activePanel, fileTreeProps }: CodingSidebarProps) {
  const title = panelTitles[activePanel];

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-7 shrink-0 items-center px-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </span>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {activePanel === 'explorer' && fileTreeProps ? (
          <FileTree {...fileTreeProps} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <span className="text-xs text-[var(--text-muted)]">{title} panel</span>
          </div>
        )}
      </div>
    </aside>
  );
}
