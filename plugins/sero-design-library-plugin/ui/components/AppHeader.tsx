import { cn } from '@sero-ai/ui';
import { Palette } from 'lucide-react';
import type { DesignLibraryPageId } from '../../shared/state';

interface AppHeaderProps {
  activePage: DesignLibraryPageId;
  counts: Record<DesignLibraryPageId, number>;
  onNavigate: (page: DesignLibraryPageId) => void;
}

const PAGES: DesignLibraryPageId[] = ['library', 'design', 'gallery'];

export function AppHeader({ activePage, counts, onNavigate }: AppHeaderProps) {
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
    </header>
  );
}

function pageLabel(page: DesignLibraryPageId): string {
  return page[0].toUpperCase() + page.slice(1);
}
