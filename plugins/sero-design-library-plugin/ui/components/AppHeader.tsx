import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui';
import { Palette } from 'lucide-react';
import type { DesignLibraryPageId } from '../../shared/state';

interface AppHeaderProps {
  activePage: DesignLibraryPageId;
  counts: Record<DesignLibraryPageId, number>;
  onNavigate: (page: DesignLibraryPageId) => void;
  /** Trailing chrome — the profile settings control. */
  settings?: ReactNode;
}

const PAGES: DesignLibraryPageId[] = ['library', 'design', 'gallery'];

export function AppHeader({ activePage, counts, onNavigate, settings }: AppHeaderProps) {
  return (
    <header className="dl-header">
      <div className="dl-brand">
        <span className="dl-brand__mark"><Palette size={14} /></span>
        <span>Design Library</span>
      </div>

      <nav aria-label="Design Library sections" className="dl-tabs">
        {PAGES.map((page) => (
          <button
            aria-current={activePage === page ? 'page' : undefined}
            className={cn('dl-tab', activePage === page && 'dl-tab--active')}
            key={page}
            onClick={() => onNavigate(page)}
            type="button"
          >
            <span>{pageLabel(page)}</span>
            <span className="dl-tab__count">{counts[page]}</span>
          </button>
        ))}
      </nav>

      <div className="dl-header__actions">{settings}</div>
    </header>
  );
}

function pageLabel(page: DesignLibraryPageId): string {
  return page[0].toUpperCase() + page.slice(1);
}
