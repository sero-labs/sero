import type { CodingPanel } from './ActivityBar';

const panelTitles: Record<CodingPanel, string> = {
  explorer: 'Explorer',
  search: 'Search',
  git: 'Source Control',
};

interface CodingSidebarProps {
  activePanel: CodingPanel;
}

/**
 * CodingSidebar — panel content for the coding workspace activity bar.
 *
 * Each panel is a placeholder showing only its name.
 * Real content (file tree, search input, git status) replaces these later.
 */
export function CodingSidebar({ activePanel }: CodingSidebarProps) {
  const title = panelTitles[activePanel];

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border/50 bg-[var(--bg-surface)]">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex h-8 shrink-0 items-center px-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </span>
      </div>

      {/* ── Content placeholder ──────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-sm text-[var(--text-muted)]">{title} panel</span>
      </div>
    </aside>
  );
}
