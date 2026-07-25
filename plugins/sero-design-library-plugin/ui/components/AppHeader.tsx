import { Button } from '@sero-ai/ui/components/ui/button.js';
import { cn } from '@sero-ai/ui/lib/utils.js';
import { ImagePlus, Palette } from 'lucide-react';
import type { DesignLibraryPage } from '../types';

interface AppHeaderProps {
  activePage: DesignLibraryPage;
  counts: Record<DesignLibraryPage, number>;
  onNavigate: (page: DesignLibraryPage) => void;
}

const PAGES: DesignLibraryPage[] = ['library', 'design', 'gallery'];

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

      <div className="dl-header__actions">
        <Button size="sm">
          <ImagePlus aria-hidden="true" size={15} />
          Add inspiration
        </Button>
      </div>
    </header>
  );
}

function pageLabel(page: DesignLibraryPage): string {
  return page[0].toUpperCase() + page.slice(1);
}
